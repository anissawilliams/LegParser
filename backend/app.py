"""
Ordinance Parser API - v2.2 (Flask)
Uses professional schema with proper regulatory_logic structure
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
import json
import re
from datetime import datetime

app = Flask(__name__)

# Configure CORS
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
CORS(app, origins=[FRONTEND_URL, "http://localhost:3000", "http://localhost:5001", "http://localhost:5173", "*"])

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
DATABASE_URL = os.environ.get("DATABASE_URL")

if not ANTHROPIC_API_KEY:
    print("WARNING: ANTHROPIC_API_KEY environment variable not set!")
else:
    print(f"API Key loaded: {ANTHROPIC_API_KEY[:10]}...")

# ============================================================================
# PROFESSIONAL SCHEMA
# ============================================================================
EXTRACTION_SCHEMA = {
    "ordinance_number": {
        "type": "string",
        "description": "Official ordinance/law number or identifier."
    },
    "jurisdiction": {
        "type": "string",
        "description": "City, county, or municipality name."
    },
    "effective_date": {
        "type": "string",
        "description": "Date the ordinance takes effect."
    },
    "phase_in_dates": {
        "type": "array",
        "description": "Any phased implementation dates."
    },
    "overview": {
        "type": "string",
        "description": "A concise 2-4 sentence natural-language summary beginning with 'This ordinance ...'. Describe the core prohibitions, requirements, exemptions, and enforcement."
    },
    "covered_establishments": {
        "type": "array",
        "description": "Types of food service establishments covered."
    },
    "prohibited_items": {
        "type": "array",
        "description": "Specific items or materials that are prohibited."
    },
    "required_alternatives": {
        "type": "array",
        "description": "Required alternative materials (compostable, recyclable, etc.)."
    },
    "exemptions": {
        "type": "array",
        "description": "Any exemptions or exceptions."
    },
    "penalties": {
        "type": "string",
        "description": "Fines or penalties for violations. Include the sentence: 'Violations of this Ordinance will be considered an ____.' If no penalties found, return 'No penalties specified.'"
    },
    "enforcement_agency": {
        "type": "string",
        "description": "Agency responsible for enforcement."
    },
    "labeling_requirements": {
        "type": "array",
        "description": "Labeling requirements (e.g. 'Recyclable', 'Compostable'). If none, return ['No specific labeling requirements found.']"
    },
    "operational_requirements": {
        "type": "array",
        "description": "Operational requirements (e.g. compostable use, recycling rules)."
    },
    "utensils_and_accessories_requirements": {
        "type": "array",
        "description": "Rules for straws, utensils, lids, condiments, etc."
    },
    "provisions": {
        "type": "array",
        "description": "Summarize only the core rule categories (bans, required alternatives, upon-request rules, exemptions, enforcement, penalties). Do NOT list each actor-specific clause separately. Combine similar provisions. Exclude narrative findings and definitions. Return 3-8 high-level bullets."
    },
    "SKU_types": {
        "type": "array",
        "description": "SKU types referenced (e.g. containers, cups, utensils, straws, lids, plates, bowls, trays, cartons)."
    },
    "rule_signals": {
        "type": "object",
        "description": "Boolean flags indicating which rule types appear.",
        "properties": {
            "contains_polystyrene_ban": "true if polystyrene/EPS/styrofoam is banned",
            "contains_pfas_ban": "true if PFAS/fluorinated chemicals are banned",
            "contains_packaging_ban": "true if general packaging ban exists",
            "contains_upon_request_rule": "true if items provided only upon request",
            "contains_alternative_requirement": "true if compostable/recyclable alternatives required",
            "contains_labeling_requirement": "true if labeling is required",
            "contains_operational_requirement": "true if operational rules exist"
        }
    },
    "regulatory_logic": {
        "type": "array",
        "description": "Structured rule objects. Each must have: rule_type, applicability_conditions (with 'all' and 'any' arrays of condition objects), assertion_outcome, reason_template.",
        "item_structure": {
            "rule_type": "material_ban | packaging_ban | upon_request | alternative_requirement | labeling | operational | fee_requirement | exemption",
            "applicability_conditions": {
                "all": "Array of condition objects that ALL must be met. Each object has: field, value, operator (in, is, not_in, contains, not_encased, etc.)",
                "any": "Array of condition objects where AT LEAST ONE must be met. Same structure as 'all'."
            },
            "assertion_outcome": "non_compliant | compliant | conditional | exempt | fee_applies",
            "reason_template": "Template string with {placeholders} for field values explaining the rule."
        }
    }
}

# ============================================================================
# DEFAULT EXAMPLES - Professional quality extractions
# ============================================================================
DEFAULT_EXAMPLES = [
    {
        "id": "default-cotati",
        "jurisdiction": "Cotati",
        "ordinance_number": "8.20",
        "source_snippet": "This ordinance prohibits the use and sale of disposable food service ware containing polystyrene foam or PFAS by food providers, city facilities, and city contractors...",
        "rule_signals": {
            "contains_polystyrene_ban": True,
            "contains_pfas_ban": True,
            "contains_packaging_ban": True,
            "contains_upon_request_rule": True,
            "contains_alternative_requirement": True,
            "contains_labeling_requirement": False,
            "contains_operational_requirement": True
        },
        "regulatory_logic": [
            {
                "rule_type": "material_ban",
                "reason_template": "The use of {item_type} made of {material} is prohibited for {establishment_type}.",
                "assertion_outcome": "non_compliant",
                "applicability_conditions": {
                    "all": [
                        {"field": "establishment_type", "value": "Food providers, City facilities, City contractors and lessees", "operator": "in"},
                        {"field": "item_type", "value": "disposable food service ware", "operator": "in"},
                        {"field": "material", "value": "polystyrene foam, PFAS", "operator": "in"}
                    ],
                    "any": []
                }
            },
            {
                "rule_type": "alternative_requirement",
                "reason_template": "{establishment_type} must use {required_alternatives} for {item_type} when commercially available.",
                "assertion_outcome": "compliant",
                "applicability_conditions": {
                    "all": [
                        {"field": "establishment_type", "value": "Food providers, City facilities, City departments", "operator": "in"},
                        {"field": "item_type", "value": "disposable food service ware", "operator": "in"},
                        {"field": "commercial_availability", "value": "true", "operator": "is"}
                    ],
                    "any": []
                }
            },
            {
                "rule_type": "upon_request",
                "reason_template": "{item_type} must only be provided upon customer request by {establishment_type}.",
                "assertion_outcome": "compliant",
                "applicability_conditions": {
                    "all": [
                        {"field": "establishment_type", "value": "Food providers", "operator": "is"},
                        {"field": "item_type", "value": "straws, lids, cutlery, to-go condiment packages", "operator": "in"}
                    ],
                    "any": []
                }
            }
        ],
        "prohibited_items": ["Disposable food service ware containing polystyrene foam", "Disposable food service ware containing PFAS"],
        "required_alternatives": ["Compostable product accepted at local compost facilities", "Recyclable product"],
        "saved_at": "2025-01-01T00:00:00"
    }
]

# ============================================================================
# IN-MEMORY RUNTIME STORAGE
# ============================================================================
runtime_examples = []

# ============================================================================
# EXAMPLE ACCESS
# ============================================================================
def get_all_examples():
    examples = list(runtime_examples)
    if len(examples) < 3:
        examples.extend(DEFAULT_EXAMPLES)
    seen = set()
    unique = []
    for ex in examples:
        key = f"{ex.get('jurisdiction')}-{ex.get('ordinance_number')}"
        if key not in seen:
            seen.add(key)
            unique.append(ex)
    return unique[:10]

def save_example(example):
    global runtime_examples
    example['id'] = f"runtime-{datetime.now().timestamp()}"
    example['saved_at'] = datetime.now().isoformat()
    runtime_examples.insert(0, example)
    runtime_examples = runtime_examples[:10]
    return get_all_examples()

# ============================================================================
# PROMPT BUILDER
# ============================================================================
def build_extraction_prompt(text, corrections=None, feedback=None):
    """Build prompt with professional schema and examples"""
    
    # Example output format for regulatory_logic
    example_rule = {
        "rule_type": "material_ban",
        "applicability_conditions": {
            "all": [
                {"field": "establishment_type", "value": "Food providers", "operator": "in"},
                {"field": "item_type", "value": "disposable food service ware", "operator": "in"},
                {"field": "material", "value": "polystyrene foam", "operator": "in"}
            ],
            "any": []
        },
        "assertion_outcome": "non_compliant",
        "reason_template": "The use of {item_type} made of {material} is prohibited for {establishment_type}."
    }
    
    # Few-shot examples
    examples = get_all_examples()[:2]
    examples_section = ''
    if examples:
        ex_texts = []
        for i, ex in enumerate(examples):
            ex_texts.append(f"""
### Example {i+1}: {ex.get('jurisdiction', '?')} - {ex.get('ordinance_number', '?')}
rule_signals: {json.dumps(ex.get('rule_signals', {}), indent=2)}
regulatory_logic (sample): {json.dumps(ex.get('regulatory_logic', [])[:2], indent=2)}
""")
        examples_section = f"\n## REFERENCE EXAMPLES:\n{''.join(ex_texts)}"
    
    corrections_section = ''
    if corrections:
        corr_lines = [f"- {k}: {json.dumps(v)}" for k, v in corrections.items()]
        corrections_section = f"\n## CORRECTIONS TO APPLY:\n" + '\n'.join(corr_lines)
    
    feedback_section = f"\n## USER GUIDANCE:\n{feedback}" if feedback else ''
    
    return f"""You are an expert legal document parser specializing in food service and packaging ordinances.

## TASK
Extract ALL structured data from the ordinance text below. Pay special attention to the regulatory_logic structure.

## CRITICAL RULES
1. Extract ONLY what is explicitly stated or clearly implied
2. For missing fields, use empty arrays [] or "Not specified"
3. Boolean rule_signals must be true or false based on content
4. regulatory_logic must follow the EXACT structure shown below
5. provisions should be 3-8 HIGH-LEVEL bullets, not 30+ detailed clauses
6. Return ONLY valid JSON - no markdown, no code fences, no explanation

## REGULATORY_LOGIC STRUCTURE (CRITICAL - FOLLOW EXACTLY)

Each rule in regulatory_logic array MUST have this structure:
{json.dumps(example_rule, indent=2)}

Key requirements:
- applicability_conditions MUST be an object with "all" and "any" arrays
- Each condition in "all"/"any" MUST be an object with "field", "value", "operator"
- "all" = ALL conditions must be met
- "any" = AT LEAST ONE condition must be met (can be empty array)

Common operators: "in", "is", "not_in", "contains", "equals"
Common fields: "establishment_type", "item_type", "material", "sku_type"
assertion_outcome values: "non_compliant", "compliant", "conditional", "exempt", "fee_applies"

## RULE_SIGNALS (infer from text)
- contains_polystyrene_ban: "polystyrene", "EPS", "styrofoam", "#6"
- contains_pfas_ban: "PFAS", "perfluoroalkyl", "fluorinated"
- contains_packaging_ban: general packaging/plastic bans
- contains_upon_request_rule: "upon request", "by request"
- contains_alternative_requirement: "compostable", "recyclable" REQUIRED
- contains_labeling_requirement: labeling/marking requirements
- contains_operational_requirement: operational rules

## PROVISIONS FORMAT (3-8 bullets only)
Summarize core rules only:
- "Ban on [materials] in [items] for [establishments]"
- "Required use of [alternatives] when commercially available"
- "Accessories upon customer request only"
- "Exemptions for [key exemptions]"
- "Penalties: [summary]"
{examples_section}
{corrections_section}
{feedback_section}

## SCHEMA FIELDS
- ordinance_number, jurisdiction, effective_date, phase_in_dates
- overview (2-4 sentences starting "This ordinance...")
- covered_establishments, prohibited_items, required_alternatives, exemptions
- penalties, enforcement_agency
- labeling_requirements, operational_requirements, utensils_and_accessories_requirements
- provisions (3-8 high-level bullets)
- SKU_types
- rule_signals (object with boolean flags)
- regulatory_logic (array of rule objects with structure shown above)

## ORDINANCE TEXT
{text}

## OUTPUT (valid JSON only):"""


# ============================================================================
# SHAPING
# ============================================================================
def shape_extraction(extracted):
    signals = extracted.get('rule_signals', {})
    return {
        'test_flag': signals.get('contains_pfas_ban', False),
        'summary': {
            'jurisdiction': extracted.get('jurisdiction'),
            'ordinance_number': extracted.get('ordinance_number'),
            'effective_date': extracted.get('effective_date'),
            'has_polystyrene_ban': signals.get('contains_polystyrene_ban', False),
            'has_pfas_ban': signals.get('contains_pfas_ban', False),
            'has_upon_request': signals.get('contains_upon_request_rule', False),
            'has_alternatives_required': signals.get('contains_alternative_requirement', False)
        },
        'rule_count': len(extracted.get('regulatory_logic', [])),
        'regulatory_logic': extracted.get('regulatory_logic', [])
    }


# ============================================================================
# ROUTES
# ============================================================================
@app.route("/")
def home():
    return "Ordinance Parser API v2.2"

@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "api_key_set": bool(ANTHROPIC_API_KEY),
        "examples_count": len(get_all_examples()),
        "default_examples": len(DEFAULT_EXAMPLES),
        "runtime_examples": len(runtime_examples)
    })

@app.route("/api/extract", methods=["POST"])
def extract():
    data = request.json
    
    text = data.get('text') or data.get('prompt')
    corrections = data.get('corrections')
    feedback = data.get('feedback')
    return_shaped = data.get('return_shaped', True)
    use_learning = data.get('use_learning', True)
    
    if not text:
        return jsonify({"error": "No text/prompt provided"}), 400
    
    if use_learning:
        prompt = build_extraction_prompt(text, corrections, feedback)
    else:
        prompt = text
    
    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "Content-Type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01"
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 8000,
                "messages": [{"role": "user", "content": prompt}]
            }
        )
        
        if resp.status_code != 200:
            return jsonify({"error": resp.json()}), resp.status_code
        
        response_data = resp.json()
        
        if use_learning:
            response_text = ''.join([c.get('text', '') for c in response_data.get('content', [])])
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            
            if not json_match:
                return jsonify({"error": "No JSON in response", "raw": response_text}), 500
            
            extracted = json.loads(json_match.group())
            result = {"extracted": extracted}
            
            if return_shaped:
                result["shaped"] = shape_extraction(extracted)
            
            return jsonify(result)
        else:
            return jsonify(response_data)
        
    except json.JSONDecodeError as e:
        return jsonify({"error": f"JSON parse error: {e}"}), 500
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/shape", methods=["POST"])
def shape():
    data = request.json
    extracted = data.get('extracted')
    if not extracted:
        return jsonify({"error": "No data provided"}), 400
    return jsonify({"shaped": shape_extraction(extracted)})

@app.route("/api/examples", methods=["GET"])
def get_examples():
    return jsonify({
        "examples": get_all_examples(),
        "sources": {
            "default": len(DEFAULT_EXAMPLES),
            "runtime": len(runtime_examples)
        }
    })

@app.route("/api/examples", methods=["POST"])
def add_example():
    data = request.json
    example = {
        'jurisdiction': data.get('jurisdiction'),
        'ordinance_number': data.get('ordinance_number'),
        'source_snippet': (data.get('source_snippet') or '')[:500],
        'rule_signals': data.get('rule_signals', {}),
        'regulatory_logic': (data.get('regulatory_logic') or [])[:5],
        'prohibited_items': data.get('prohibited_items', []),
        'required_alternatives': data.get('required_alternatives', [])
    }
    examples = save_example(example)
    return jsonify({"success": True, "total_examples": len(examples)})

@app.route("/api/examples", methods=["DELETE"])
def clear_examples():
    global runtime_examples
    runtime_examples = []
    return jsonify({"success": True, "message": "Runtime examples cleared"})

@app.route("/api/schema", methods=["GET"])
def get_schema():
    return jsonify({"schema": EXTRACTION_SCHEMA})


if __name__ == "__main__":
    print("=" * 50)
    print("Ordinance Parser API v2.2")
    print("=" * 50)
    print(f"✓ Default examples: {len(DEFAULT_EXAMPLES)}")
    print("=" * 50)
    
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)
