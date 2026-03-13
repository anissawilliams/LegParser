import React, { useState, useEffect } from 'react';
import './OrdinanceParser.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const DEFAULT_SCHEMA = {
  // === IDENTIFICATION ===
  instrument_number: {
    description: "Document identifier - could be chapter number (e.g., '8.17'), ordinance number (e.g., 'Ord. 759'), or section range. Extract whatever is most prominent.",
    type: "string"
  },
  jurisdiction: {
    description: "City, county, or municipality name. Usually in the chapter title or first section.",
    type: "string"
  },
  effective_date: {
    description: "Look for 'Effective date' section or 'shall become effective on [DATE]'. Format as written.",
    type: "string"
  },

  // === CLASSIFICATION (what type of regulation is this?) ===
  pfas_ban: {
    description: "Does this ordinance ban PFAS (per- and polyfluoroalkyl substances) in food packaging? Look for 'PFAS', 'fluorinated', 'perfluoro'. Return true or false.",
    type: "boolean"
  },
  poly_6_ban: {
    description: "Does this ordinance ban polystyrene / #6 plastic / EPS / Styrofoam? Look for 'polystyrene', 'EPS', 'expanded polystyrene', 'Styrofoam', '#6', 'resin code 6'. Return true or false.",
    type: "boolean"
  },
  rrc_required: {
    description: "Does this ordinance REQUIRE alternatives be Reusable, Recyclable, or Compostable? Look for 'shall use', 'must be', 'required to use' with terms 'reusable', 'recyclable', 'compostable'. Return true or false.",
    type: "boolean"
  },
  straw_restriction: {
    description: "Does this ordinance ban or restrict plastic straws? Could be outright ban OR 'upon request only'. Return true or false.",
    type: "boolean"
  },
  single_use_ban: {
    description: "Does this ordinance have a broader single-use plastics ban beyond just polystyrene? Look for 'single-use plastic', 'disposable plastic'. Return true or false.",
    type: "boolean"
  },
  accessories_upon_request: {
    description: "Does this ordinance require utensils, straws, condiments, or napkins be provided ONLY upon customer request? Look for 'upon request', 'only when requested', 'customer request'. Return true or false.",
    type: "boolean"
  },

  // === SCOPE (what items are covered?) ===
  covered_foodware: {
    description: "What food ware items are regulated? Look in definitions and prohibited sections. List all that apply: containers, clamshells, cups, bowls, plates, trays, straws, utensils, lids, stirrers, bags, wrappers, cartons, cutlery, napkins, condiment packets.",
    type: "array"
  },
  covered_establishments: {
    description: "Who must comply? Look in Definitions for 'food provider', 'food facility', 'food vendor', 'restaurant', 'store'. List business types.",
    type: "array"
  },

  // === DETAILS ===
  prohibited_materials: {
    description: "What MATERIALS are banned? Examples: polystyrene foam, EPS, PFAS, plastic, non-recyclable plastic. List each.",
    type: "array"
  },
  required_alternatives: {
    description: "What alternatives are required or permitted? Examples: reusable, recyclable, compostable, ASTM D6400 certified, BPI certified, fiber-based, paper.",
    type: "array"
  },
  exemptions: {
    description: "What is EXEMPT or EXCLUDED from the ban? Look for 'Excluded', 'Exempt', 'Exceptions' sections. Include both exempt ITEMS (e.g., 'raw meat trays') and exempt SITUATIONS (e.g., 'prepackaged foods', 'medical facilities').",
    type: "array"
  },

  // === ENFORCEMENT ===
  penalties_summary: {
    description: "Rewrite the penalty structure in plain, easy-to-understand language for a business owner. Example: '1st violation: Warning. 2nd violation: $100 fine. 3rd+: $250 fine.' If it just references another code section, say 'Penalties per [section] - contact city for details.'",
    type: "string"
  },
  enforcement_agency: {
    description: "Who enforces? Look for 'enforced by', 'administered by'. Examples: City Manager, Health Department, Environmental Services, Planning Division.",
    type: "string"
  },

  // === SUMMARY ===
  plain_language_summary: {
    description: "Write a 2-3 sentence summary of what this ordinance does, in plain language a restaurant owner would understand. Focus on: what's banned, what's required, who it applies to.",
    type: "string"
  },

  // === REGULATORY LOGIC (new) ===
  regulatory_logic: {
    description: "Generate structured rule objects for each distinct regulation. Each rule should have: rule_type (material_ban, packaging_ban, upon_request, alternative_required, labeling, operational, fee_requirement, exemption), target_materials (array), target_sku_types (array), target_establishments (array), assertion_outcome (prohibited, required, conditional, exempt, fee_applies), conditions (array), reason_template (plain English explanation).",
    type: "array"
  }
};

const SAMPLE_TEXT = `Chapter 8.17
FOOD AND BEVERAGE SERVICE WARE REGULATIONS

8.17.010 Title.
This chapter shall be known as the Concord food and beverage service ware regulations ordinance.

(Ord. No. 18-5, § 6 (Exh. A))

8.17.020 Effective date.
This chapter shall become effective on January 1, 2019.

8.17.050 Definitions.
Food and beverage providers means any vendor, business, organization, including any full service restaurant, limited service restaurant, supermarket, cafeteria, catering truck, sidewalk vendor, caterer, childcare facilities, hospitals, private schools, that sells or serves nonprepackaged food or beverages.

Polystyrene foam means blown polystyrene and expanded and extruded foams (sometimes called Styrofoam), thermoplastic petrochemical materials utilizing a styrene monomer. Polystyrene foam is commonly made into disposable food service ware.

8.17.060 Prohibited food and beverage service ware.
All food and beverage providers are prohibited from providing food or beverages in food and beverage service ware made from foam polystyrene.

8.17.070 Required food and beverage service ware.
Food and beverage providers are required to use food or beverage service ware that is readily reusable, recyclable, or compostable.

8.17.080 Excluded food and beverage service ware.
Table 8.17.080

Food Service Ware | Included in Ban | Excluded from Ban
Cups              | X               |
Bowls             | X               |
Plates            | X               |
Clamshells        | X               |
Serving trays     | X               |
Straws            |                 | X
Stir sticks       |                 | X
Drink lids        |                 | X
Utensils          |                 | X
Egg cartons       |                 | X

8.17.110 Excluded prepackaged foods.
Food providers may sell food in polystyrene foam if packaged outside Concord city limits.

8.17.140 Enforcement and violation.
Any violation of this chapter is a misdemeanor. First and second violations: written warning. Third violation: $100 fine. Subsequent violations: $250 fine per day.

(Ord. No. 18-5)`;

export default function OrdinanceParser() {
  const [schemaText, setSchemaText] = useState(JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [ordinanceText, setOrdinanceText] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [extractions, setExtractions] = useState([]);
  
  // New: validation and learning state
  const [validationState, setValidationState] = useState({});
  const [feedback, setFeedback] = useState('');
  const [exampleCount, setExampleCount] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);

  // Load example count on mount
  useEffect(() => {
    fetchExampleCount();
  }, []);

  const fetchExampleCount = async () => {
    try {
      const res = await fetch(`${API_URL}/api/examples`);
      const data = await res.json();
      setExampleCount(data.examples?.length || 0);
    } catch (e) {
      console.error('Failed to load examples:', e);
    }
  };

  const extractInfo = async (isRerun = false) => {
    setLoading(true);
    setError(null);
    if (!isRerun) {
      setResults(null);
      setValidationState({});
    }

    let schema;
    try {
      schema = JSON.parse(schemaText);
    } catch (e) {
      setError('Invalid JSON schema: ' + e.message);
      setLoading(false);
      return;
    }

    if (!ordinanceText.trim()) {
      setError('Please paste ordinance text to parse');
      setLoading(false);
      return;
    }

    // Build corrections from validation state
    let corrections = null;
    if (isRerun && results) {
      corrections = {};
      Object.keys(validationState).forEach(key => {
        if (validationState[key] === 'invalid') {
          corrections[key] = `Previous value "${results[key]}" was marked incorrect. Please re-extract.`;
        }
      });
    }

    try {
      const response = await fetch(`${API_URL}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ordinanceText,
          corrections: isRerun ? corrections : null,
          feedback: isRerun ? feedback : null,
          return_shaped: true,
          use_learning: true
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Handle new API response format
      const extracted = data.extracted || data;
      
      // If old format, parse it
      if (!data.extracted && data.content) {
        let text = data.content.map(c => c.text || '').join('');
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          text = codeBlockMatch[1];
        } else {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) text = jsonMatch[0];
        }
        const parsed = JSON.parse(text.trim());
        setResults(parsed);
        addToArchive(parsed, schema);
      } else {
        setResults(extracted);
        addToArchive(extracted, schema);
      }

      setValidationState({});
      setFeedback('');
      setShowFeedback(false);

    } catch (e) {
      setError('Extraction failed: ' + e.message);
      console.error('Full error:', e);
    }

    setLoading(false);
  };

  const addToArchive = (extracted, schema) => {
    const archiveEntry = {
      id: Date.now(),
      extracted_at: new Date().toISOString(),
      schema_used: schema,
      source_text_preview: ordinanceText.substring(0, 200) + '...',
      data: extracted
    };
    setExtractions(prev => [archiveEntry, ...prev]);
  };

  const markField = (key, status) => {
    setValidationState(prev => ({ ...prev, [key]: status }));
  };

  const saveAsExample = async () => {
    if (!results) return;

    try {
      const res = await fetch(`${API_URL}/api/examples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jurisdiction: results.jurisdiction,
          ordinance_number: results.instrument_number,
          source_snippet: ordinanceText.substring(0, 500),
          rule_signals: {
            contains_polystyrene_ban: results.poly_6_ban,
            contains_pfas_ban: results.pfas_ban,
            contains_packaging_ban: results.single_use_ban,
            contains_upon_request_rule: results.accessories_upon_request,
            contains_alternative_requirement: results.rrc_required,
            contains_labeling_requirement: false,
            contains_operational_requirement: false
          },
          regulatory_logic: results.regulatory_logic || [],
          prohibited_items: results.prohibited_materials || [],
          required_alternatives: results.required_alternatives || []
        })
      });

      const data = await res.json();
      if (data.success) {
        setExampleCount(data.total_examples);
        alert(`Saved as example! Total: ${data.total_examples}`);
      }
    } catch (e) {
      alert('Failed to save: ' + e.message);
    }
  };

  const downloadJSON = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadSample = () => {
    setOrdinanceText(SAMPLE_TEXT);
  };

  // Count validations
  const validCount = Object.values(validationState).filter(v => v === 'valid').length;
  const invalidCount = Object.values(validationState).filter(v => v === 'invalid').length;

  // Group results by category for display
  const renderResults = (results) => {
    const classification = ['pfas_ban', 'poly_6_ban', 'rrc_required', 'straw_restriction', 'single_use_ban', 'accessories_upon_request'];
    const identification = ['instrument_number', 'jurisdiction', 'effective_date'];
    const scope = ['covered_foodware', 'covered_establishments'];
    const details = ['prohibited_materials', 'required_alternatives', 'exemptions'];
    const enforcement = ['penalties_summary', 'enforcement_agency'];
    const summary = ['plain_language_summary'];
    const logic = ['regulatory_logic'];

    const renderSection = (title, keys) => {
      const sectionData = keys.filter(k => results[k] !== undefined);
      if (sectionData.length === 0) return null;
      
      return (
        <div key={title} className="results-section">
          <h3 className="section-title">{title}</h3>
          <table className="results-table">
            <tbody>
              {sectionData.map(key => (
                <tr key={key} className={validationState[key] ? `validation-${validationState[key]}` : ''}>
                  <td className="key-cell">
                    <div className="key-with-validation">
                      <span>{key}</span>
                      <div className="validation-buttons">
                        <button
                          onClick={() => markField(key, 'valid')}
                          className={`v-btn ${validationState[key] === 'valid' ? 'active' : ''}`}
                          title="Mark correct"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => markField(key, 'invalid')}
                          className={`v-btn v-btn-x ${validationState[key] === 'invalid' ? 'active' : ''}`}
                          title="Mark incorrect"
                        >
                          ✗
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="value-cell">
                    {results[key] === null ? (
                      <span className="muted">Not found</span>
                    ) : typeof results[key] === 'boolean' ? (
                      <span className={results[key] ? 'badge-yes' : 'badge-no'}>
                        {results[key] ? 'YES' : 'NO'}
                      </span>
                    ) : Array.isArray(results[key]) ? (
                      results[key].length === 0 ? (
                        <span className="muted">None</span>
                      ) : key === 'regulatory_logic' ? (
                        <div className="logic-list-inline">
                          {results[key].map((rule, i) => (
                            <div key={i} className="logic-card">
                              <div className="logic-card-header">
                                <span className="logic-type-badge">{rule.rule_type}</span>
                                <span className="logic-outcome-badge" data-outcome={rule.assertion_outcome}>
                                  {rule.assertion_outcome}
                                </span>
                              </div>
                              <div className="logic-reason">{rule.reason_template}</div>
                              {rule.applicability_conditions && (
                                <div className="logic-conditions">
                                  {rule.applicability_conditions.all?.length > 0 && (
                                    <div className="conditions-group">
                                      <span className="conditions-label">ALL of:</span>
                                      <ul>
                                        {rule.applicability_conditions.all.map((cond, j) => (
                                          <li key={j}>
                                            <code>{cond.field}</code> {cond.operator} <em>{cond.value}</em>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {rule.applicability_conditions.any?.length > 0 && (
                                    <div className="conditions-group">
                                      <span className="conditions-label">ANY of:</span>
                                      <ul>
                                        {rule.applicability_conditions.any.map((cond, j) => (
                                          <li key={j}>
                                            <code>{cond.field}</code> {cond.operator} <em>{cond.value}</em>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <ul>
                          {results[key].map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                      )
                    ) : (
                      String(results[key])
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    return (
      <>
        {renderSection('Classification', classification)}
        {renderSection('Identification', identification)}
        {renderSection('Scope', scope)}
        {renderSection('Details', details)}
        {renderSection('Enforcement', enforcement)}
        {renderSection('Summary', summary)}
        {renderSection('Regulatory Logic', logic)}
      </>
    );
  };

  return (
    <div className="page">
      <div className="header-row">
        <div>
          <h1 className="title">Ordinance Parser</h1>
          <p className="subtitle">
            Extract structured data from food ware and plastic ordinances.
          </p>
        </div>
        <div className="example-badge">
          📚 {exampleCount} learned examples
        </div>
      </div>

      <div className="two-col">
        <div>
          <div className="label-row">
            <label className="label">Schema (JSON)</label>
            <button
              onClick={() => setSchemaText(JSON.stringify(DEFAULT_SCHEMA, null, 2))}
              className="link-button"
            >
              Reset to default
            </button>
          </div>
          <textarea
            value={schemaText}
            onChange={(e) => setSchemaText(e.target.value)}
            className="textarea code"
            spellCheck={false}
          />
        </div>

        <div>
          <div className="label-row">
            <label className="label">Ordinance Text</label>
            <button
              onClick={loadSample}
              className="link-button"
            >
              Load sample
            </button>
          </div>
          <textarea
            value={ordinanceText}
            onChange={(e) => setOrdinanceText(e.target.value)}
            placeholder="Paste your ordinance text here..."
            className="textarea"
          />
        </div>
      </div>

      <button
        onClick={() => extractInfo(false)}
        disabled={loading}
        className="primary-button full"
      >
        {loading ? 'Extracting...' : 'Extract Information'}
      </button>

      {error && (
        <div className="error-box">{error}</div>
      )}

      {results && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Extracted Data</h2>
            <div className="card-actions">
              {(validCount > 0 || invalidCount > 0) && (
                <span className="validation-summary">
                  <span className="v-count valid">✓ {validCount}</span>
                  <span className="v-count invalid">✗ {invalidCount}</span>
                </span>
              )}
              <button
                onClick={saveAsExample}
                className="small-button"
                title="Save as learned example"
              >
                💾 Save Example
              </button>
              <button
                onClick={() => downloadJSON(results, `extraction-${Date.now()}.json`)}
                className="small-button success"
              >
                Download JSON
              </button>
            </div>
          </div>
          
          {renderResults(results)}

          {/* Re-run section */}
          {invalidCount > 0 && (
            <div className="rerun-section">
              <div className="rerun-header">
                <span>🔄 {invalidCount} field(s) marked incorrect</span>
                <button
                  onClick={() => setShowFeedback(!showFeedback)}
                  className="link-button"
                >
                  {showFeedback ? 'Hide feedback' : 'Add feedback'}
                </button>
              </div>
              
              {showFeedback && (
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Optional: explain what was wrong or how to fix it..."
                  className="feedback-input"
                />
              )}
              
              <button
                onClick={() => extractInfo(true)}
                disabled={loading}
                className="rerun-button"
              >
                {loading ? 'Re-extracting...' : '🔄 Re-extract with Corrections'}
              </button>
            </div>
          )}
        </div>
      )}

      {extractions.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Extraction Archive ({extractions.length})</h2>
            <button
              onClick={() => downloadJSON(extractions, `all-extractions-${Date.now()}.json`)}
              className="small-button"
            >
              Download All
            </button>
          </div>

          <div className="archive-list">
            {extractions.map((entry) => (
              <div key={entry.id} className="archive-item">
                <div>
                  <span className="archive-title">
                    {entry.data.jurisdiction || entry.data.instrument_number || 'Untitled'}
                  </span>
                  <span className="archive-date">
                    {new Date(entry.extracted_at).toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={() => downloadJSON(entry, `extraction-${entry.id}.json`)}
                  className="link-button small"
                >
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="footer-note">
        Tip: Mark fields ✓ or ✗ to validate. Save good extractions as examples to improve future parsing.
      </p>
    </div>
  );
}
