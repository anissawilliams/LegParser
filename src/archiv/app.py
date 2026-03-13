"""
Ordinance Parser API - v2.1 (Flask)
Based on original app.py structure
- Hardcoded default examples (persist across deploys)
- In-memory runtime examples (lost on restart)
- Optional Postgres if DATABASE_URL is set
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
# DEFAULT EXAMPLES - Baked into code, persist across deploys
# Add validated extractions here over time
# ============================================================================
DEFAULT_EXAMPLES = [
    {
        "id": "default-1",
        "jurisdiction": "Greenville",
        "ordinance_number": "2024-15",
        "source_snippet": "AN ORDINANCE PROHIBITING THE USE OF POLYSTYRENE FOAM AND PFAS-CONTAINING FOOD SERVICE WARE... No food service establishment shall distribute food service ware containing polystyrene foam or PFAS. All food service ware must be compostable, recyclable, or reusable.",
        "rule_signals": {
            "contains_polystyrene_ban": True,
            "contains_pfas_ban": True,
            "contains_packaging_ban": False,
            "contains_upon_request_rule": True,
            "contains_alternative_requirement": True,
            "contains_labeling_requirement": False,
            "contains_operational_requirement": False
        },
        "regulatory_logic": [
            {
                "rule_type": "material_ban",
                "target_materials": ["polystyrene foam", "EPS", "PFAS"],
                "target_sku_types": ["containers", "plates", "bowls", "cups", "lids"],
                "target_establishments": ["restaurants", "cafes", "food trucks", "grocery stores"],
                "assertion_outcome": "prohibited",
                "conditions": [],
                "reason_template": "Food service ware containing polystyrene foam or PFAS is prohibited."
            },
            {
                "rule_type": "alternative_required",
                "target_materials": ["compostable", "recyclable", "reusable"],
                "target_sku_types": ["food service ware"],
                "target_establishments": ["all food service establishments"],
                "assertion_outcome": "required",
                "conditions": [],
                "reason_template": "All food service ware must be compostable, recyclable, or reusable."
            },
            {
                "rule_type": "upon_request",
                "target_materials": [],
                "target_sku_types": ["straws", "stirrers", "utensils", "condiment packets"],
                "target_establishments": ["all food service establishments"],
                "assertion_outcome": "conditional",
                "conditions": ["only upon customer request"],
                "reason_template": "Single-use accessories shall only be provided upon customer request."
            }
        ],
        "prohibited_items": ["polystyrene foam", "PFAS-containing products"],
        "required_alternatives": ["compostable", "recyclable", "reusable"],
        "saved_at": "2025-01-01T00:00:00"
    },
    {
        "id": "default-2",
        "jurisdiction": "Sample City",
        "ordinance_number": "Ord. 759",
        "source_snippet": "No store shall provide to any customer a single-use carryout plastic bag... All stores shall provide or make available only recyclable paper carryout bags or reusable bags... A store shall make recycled paper bags available for a minimum charge of ten cents per bag.",
        "rule_signals": {
            "contains_polystyrene_ban": False,
            "contains_pfas_ban": False,
            "contains_packaging_ban": True,
            "contains_upon_request_rule": False,
            "contains_alternative_requirement": True,
            "contains_labeling_requirement": False,
            "contains_operational_requirement": True
        },
        "regulatory_logic": [
            {
                "rule_type": "packaging_ban",
                "target_materials": ["single-use plastic"],
                "target_sku_types": ["carryout bags"],
                "target_establishments": ["stores", "retail"],
                "assertion_outcome": "prohibited",
                "conditions": ["does not apply to produce bags or product bags"],
                "reason_template": "Single-use carryout plastic bags are prohibited."
            },
            {
                "rule_type": "alternative_required",
                "target_materials": ["recyclable paper", "reusable"],
                "target_sku_types": ["carryout bags"],
                "target_establishments": ["stores"],
                "assertion_outcome": "required",
                "conditions": [],
                "reason_template": "Only recyclable paper or reusable bags may be provided."
            },
            {
                "rule_type": "fee_requirement",
                "target_materials": ["recycled paper"],
                "target_sku_types": ["carryout bags"],
                "target_establishments": ["stores"],
                "assertion_outcome": "fee_applies",
                "conditions": ["minimum ten cents per bag"],
                "reason_template": "Recycled paper bags must be provided for a minimum charge of $0.10."
            }
        ],
        "prohibited_items": ["single-use carryout plastic bags"],
        "required_alternatives": ["recyclable paper bags", "reusable bags"],
        "saved_at": "2025-01-01T00:00:00"
    }
]

# ============================================================================
# IN-MEMORY RUNTIME STORAGE (lost on restart)
# ============================================================================
runtime_examples = []

# ============================================================================
# POSTGRES SUPPORT (optional - only if DATABASE_URL is set)
# ============================================================================
db_connection = None


def init_postgres():
    global db_connection
    if not DATABASE_URL:
        return False
    try:
        import psycopg2
        db_connection = psycopg2.connect(DATABASE_URL)
        with db_connection.cursor() as cur:
            cur.execute("""
                        CREATE TABLE IF NOT EXISTS learned_examples
                        (
                            id
                            SERIAL
                            PRIMARY
                            KEY,
                            jurisdiction
                            VARCHAR
                        (
                            255
                        ),
                            ordinance_number VARCHAR
                        (
                            255
                        ),
                            source_snippet TEXT,
                            rule_signals JSONB,
                            regulatory_logic JSONB,
                            prohibited_items JSONB,
                            required_alternatives JSONB,
                            saved_at TIMESTAMP DEFAULT NOW
                        (
                        )
                            )
                        """)
            db_connection.commit()
        print("✓ Postgres connected")
        return True
    except Exception as e:
        print(f"⚠️ Postgres failed: {e}")
        return False


def get_examples_from_db():
    if not db_connection:
        return []
    try:
        with db_connection.cursor() as cur:
            cur.execute("""
                        SELECT jurisdiction,
                               ordinance_number,
                               source_snippet,
                               rule_signals,
                               regulatory_logic,
                               prohibited_items,
                               required_alternatives,
                               saved_at
                        FROM learned_examples
                        ORDER BY saved_at DESC LIMIT 20
                        """)
            return [{
                'jurisdiction': r[0], 'ordinance_number': r[1], 'source_snippet': r[2],
                'rule_signals': r[3], 'regulatory_logic': r[4], 'prohibited_items': r[5],
                'required_alternatives': r[6], 'saved_at': r[7].isoformat() if r[7] else None
            } for r in cur.fetchall()]
    except:
        return []


def save_example_to_db(example):
    if not db_connection:
        return False
    try:
        with db_connection.cursor() as cur:
            cur.execute("""
                        INSERT INTO learned_examples
                        (jurisdiction, ordinance_number, source_snippet, rule_signals,
                         regulatory_logic, prohibited_items, required_alternatives)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """, (
                            example.get('jurisdiction'), example.get('ordinance_number'),
                            example.get('source_snippet'), json.dumps(example.get('rule_signals', {})),
                            json.dumps(example.get('regulatory_logic', [])),
                            json.dumps(example.get('prohibited_items', [])),
                            json.dumps(example.get('required_alternatives', []))
                        ))
            db_connection.commit()
        return True
    except:
        return False


# ============================================================================
# EXAMPLE ACCESS
# ============================================================================
def get_all_examples():
    """Get examples: DB > Runtime > Default"""
    examples = []
    if db_connection:
        examples = get_examples_from_db()
    examples.extend(runtime_examples)
    if len(examples) < 3:
        examples.extend(DEFAULT_EXAMPLES)

    # Dedupe
    seen = set()
    unique = []
    for ex in examples:
        key = f"{ex.get('jurisdiction')}-{ex.get('ordinance_number')}"
        if key not in seen:
            seen.add(key)
            unique.append(ex)
    return unique[:20]


def save_example(example):
    """Save to best available storage"""
    global runtime_examples
    if db_connection and save_example_to_db(example):
        return get_all_examples()

    example['id'] = f"runtime-{datetime.now().timestamp()}"
    example['saved_at'] = datetime.now().isoformat()
    runtime_examples.insert(0, example)
    runtime_examples = runtime_examples[:10]
    return get_all_examples()


# ============================================================================
# PROMPT BUILDER
# ============================================================================
def build_extraction_prompt(text, corrections=None, feedback=None):
    """Build prompt with schema and learned examples"""

    # Few-shot examples
    examples = get_all_examples()[:3]
    examples_section = ''
    if examples:
        ex_texts = []
        for i, ex in enumerate(examples):
            ex_texts.append(f"""
### Example {i + 1}: {ex.get('jurisdiction', '?')} - {ex.get('ordinance_number', '?')}
Source: "{ex.get('source_snippet', '')[:300]}..."
rule_signals: {json.dumps(ex.get('rule_signals', {}), indent=2)}
regulatory_logic: {json.dumps(ex.get('regulatory_logic', [])[:2], indent=2)}
""")
        examples_section = f"\n## LEARNED EXAMPLES (match this style):\n{''.join(ex_texts)}"

    corrections_section = ''
    if corrections:
        corr_lines = [f"- {k}: {json.dumps(v)}" for k, v in corrections.items()]
        corrections_section = f"\n## CORRECTIONS TO APPLY:\n" + '\n'.join(corr_lines)

    feedback_section = f"\n## USER GUIDANCE:\n{feedback}" if feedback else ''

    return f"""You are an expert legal document parser for regulatory ordinances.

## TASK: Extract ALL structured data from the legislative text.

## RULES:
1. Extract only what's stated or clearly implied
2. Use empty arrays [] or "Not specified" for missing fields
3. INFER rule_signals booleans from keywords/context
4. GENERATE regulatory_logic for each distinct rule
5. Return ONLY valid JSON — no markdown, no code fences, no explanation

## INFERENCE (rule_signals):
- contains_polystyrene_ban: "polystyrene", "EPS", "styrofoam", "#6 plastic"
- contains_pfas_ban: "PFAS", "perfluoroalkyl", "fluorinated"
- contains_packaging_ban: bans on bags, packaging, single-use plastics
- contains_upon_request_rule: "upon request", "by request", "only when requested"
- contains_alternative_requirement: "compostable", "recyclable", "reusable" required
- contains_labeling_requirement: labeling/marking required
- contains_operational_requirement: record-keeping, training, reporting

## SCHEMA:
- ordinance_number (string): Official ordinance number
- jurisdiction (string): City/county/municipality
- effective_date (string): When it takes effect
- phase_in_dates (array): Phased implementation dates
- overview (string): 2-4 sentence summary starting "This ordinance..."
- covered_establishments (array): Establishment types covered
- prohibited_items (array): Items/materials prohibited
- required_alternatives (array): Required alternatives
- exemptions (array): Exemptions
- penalties (string): Penalties for violations
- enforcement_agency (string): Who enforces
- labeling_requirements (array): Labeling rules
- operational_requirements (array): Operational rules
- utensils_and_accessories_requirements (array): Utensil/accessory rules
- provisions (array): 3-8 key actionable provisions
- SKU_types (array): SKU types referenced
- rule_signals (object): Boolean flags (see inference guide above)
- regulatory_logic (array): Structured rule objects with rule_type, target_materials, target_sku_types, target_establishments, assertion_outcome, conditions, reason_template
{examples_section}{corrections_section}{feedback_section}

## TEXT TO PARSE:
{text}

## OUTPUT (valid JSON only):"""


# ============================================================================
# SHAPING
# ============================================================================
def shape_extraction(extracted):
    """Transform extracted data into compliance-ready format"""
    signals = extracted.get('rule_signals', {})
    sku_types = [s for s in extracted.get('SKU_types', []) if 'No SKU' not in s]

    shaped = {
        'test_flag': signals.get('contains_pfas_ban', False),
        'requirements': [],
        'sku_requirements': [],
        'regulatory_logic': extracted.get('regulatory_logic', [])
    }

    req_map = {
        'contains_polystyrene_ban': ('prohibition', 'Polystyrene foam prohibited'),
        'contains_pfas_ban': ('prohibition', 'PFAS products prohibited'),
        'contains_packaging_ban': ('prohibition', 'Certain packaging prohibited'),
        'contains_upon_request_rule': ('conditional', 'Accessories upon request only'),
        'contains_alternative_requirement': ('mandate', 'Alternatives required'),
        'contains_labeling_requirement': ('labeling', 'Labeling required'),
        'contains_operational_requirement': ('operational', 'Operational rules apply')
    }

    for signal, (obl_type, details) in req_map.items():
        if signals.get(signal):
            shaped['requirements'].append({
                'obligation_type': obl_type,
                'requirement_details': details,
                'effective_date': extracted.get('effective_date')
            })

    for sku in sku_types:
        classification = 'allowed'
        reason = 'No restrictions'
        if signals.get('contains_polystyrene_ban') or signals.get('contains_pfas_ban'):
            classification = 'restricted'
            reason = 'Material restrictions apply'
        elif signals.get('contains_alternative_requirement'):
            classification = 'conditional'
            reason = 'Must be compostable/recyclable'

        shaped['sku_requirements'].append({
            'sku_type': sku,
            'classification': classification,
            'reason': reason
        })

    return shaped


# ============================================================================
# ROUTES
# ============================================================================
@app.route("/")
def home():
    return "Ordinance Parser API v2.1"


@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "api_key_set": bool(ANTHROPIC_API_KEY),
        "postgres_connected": db_connection is not None,
        "examples_count": len(get_all_examples()),
        "default_examples": len(DEFAULT_EXAMPLES),
        "runtime_examples": len(runtime_examples)
    })


@app.route("/api/extract", methods=["POST"])
def extract():
    """Main extraction endpoint - supports both legacy and new format"""
    data = request.json

    # Support both legacy (prompt) and new (text) format
    text = data.get('text') or data.get('prompt')
    corrections = data.get('corrections')
    feedback = data.get('feedback')
    return_shaped = data.get('return_shaped', True)
    use_learning = data.get('use_learning', True)

    if not text:
        return jsonify({"error": "No text/prompt provided"}), 400

    # Build prompt (with or without learning)
    if use_learning:
        prompt = build_extraction_prompt(text, corrections, feedback)
    else:
        prompt = text  # Legacy: just pass through

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
                "max_tokens": 4000,
                "messages": [{"role": "user", "content": prompt}]
            }
        )

        if resp.status_code != 200:
            return jsonify({"error": resp.json()}), resp.status_code

        response_data = resp.json()

        # If using learning, parse and shape the response
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
            # Legacy: return raw Claude response
            return jsonify(response_data)

    except json.JSONDecodeError as e:
        return jsonify({"error": f"JSON parse error: {e}"}), 500
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/shape", methods=["POST"])
def shape():
    """Shape existing data without re-extracting"""
    data = request.json
    extracted = data.get('extracted')
    if not extracted:
        return jsonify({"error": "No data provided"}), 400
    return jsonify({"shaped": shape_extraction(extracted)})


@app.route("/api/examples", methods=["GET"])
def get_examples():
    """Get all learned examples"""
    return jsonify({
        "examples": get_all_examples(),
        "sources": {
            "default": len(DEFAULT_EXAMPLES),
            "runtime": len(runtime_examples),
            "postgres": db_connection is not None
        }
    })


@app.route("/api/examples", methods=["POST"])
def add_example():
    """Save a validated extraction as example"""
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
    """Clear runtime examples"""
    global runtime_examples
    runtime_examples = []
    return jsonify({"success": True, "message": "Runtime examples cleared"})


@app.route("/api/schema", methods=["GET"])
def get_schema():
    """Return extraction schema for frontend reference"""
    return jsonify({
        "schema": {
            "ordinance_number": "string",
            "jurisdiction": "string",
            "effective_date": "string",
            "phase_in_dates": "array",
            "overview": "string",
            "covered_establishments": "array",
            "prohibited_items": "array",
            "required_alternatives": "array",
            "exemptions": "array",
            "penalties": "string",
            "enforcement_agency": "string",
            "labeling_requirements": "array",
            "operational_requirements": "array",
            "utensils_and_accessories_requirements": "array",
            "provisions": "array",
            "SKU_types": "array",
            "rule_signals": "object",
            "regulatory_logic": "array"
        }
    })


# ============================================================================
# STARTUP
# ============================================================================
if __name__ == "__main__":
    print("=" * 50)
    print("Ordinance Parser API v2.1")
    print("=" * 50)

    if DATABASE_URL:
        init_postgres()
    else:
        print("ℹ️  No DATABASE_URL, using in-memory + defaults")

    print(f"✓ Default examples: {len(DEFAULT_EXAMPLES)}")
    print("=" * 50)

    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)