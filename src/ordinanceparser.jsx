import React, { useState } from 'react';
import './OrdinanceParser.css';

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

  const extractInfo = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

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

    const schemaDescription = Object.entries(schema)
      .map(([key, val]) => `- "${key}" (${val.type}): ${val.description}`)
      .join('\n');

    const prompt = `You are extracting structured data from a California municipal food ware or plastic bag ordinance.

DOCUMENT STRUCTURE - WHERE TO FIND INFORMATION:

1. IDENTIFIER: Look for "Chapter X.XX" in the title, or "Ord. No." / "Ordinance" in parentheses at section ends.

2. EFFECTIVE DATE: Usually its own section titled "Effective date" with "shall become effective on [DATE]".

3. DEFINITIONS SECTION: Defines key terms. "Food provider", "food facility" = WHO must comply. "Polystyrene", "compostable" = WHAT materials.

4. PROHIBITED SECTIONS: 
   - If there's a TABLE: "Included" or X in "Included" column = BANNED items
   - Text with "shall not provide", "prohibited from" = BANNED

5. EXCLUDED/EXEMPT SECTIONS:
   - If there's a TABLE: "Excluded" or X in "Excluded" column = ALLOWED (exempt)
   - These are EXCEPTIONS to the ban, NOT banned items

6. REQUIRED SECTIONS: "Shall use", "must be", "required to use" = mandated alternatives

CLASSIFICATION RULES:
- pfas_ban: true if PFAS, fluorinated chemicals, or perfluoro compounds are banned
- poly_6_ban: true if polystyrene, EPS, Styrofoam, or #6 plastic is banned
- rrc_required: true if reusable/recyclable/compostable alternatives are REQUIRED (not just suggested)
- straw_restriction: true if plastic straws are banned OR only allowed upon request
- single_use_ban: true if there's a broader single-use plastic ban beyond just polystyrene
- accessories_upon_request: true if utensils/straws/condiments must be provided only when customer asks

CRITICAL RULES:
1. Extract ONLY what is explicitly stated - no assumptions
2. "Included in ban" = BANNED → goes in covered_foodware
3. "Excluded from ban" = ALLOWED → goes in exemptions  
4. Boolean fields must be true or false, not null
5. For penalties_summary and plain_language_summary: rewrite in simple terms, don't just copy legal language
6. Return ONLY valid JSON - no markdown, no code blocks, no explanation

SCHEMA:
${schemaDescription}

ORDINANCE TEXT:
${ordinanceText}

Return a JSON object with each schema field.`;

    try {
      const response = await fetch('http://localhost:5001/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      const data = await response.json();
      
      // Handle different response structures
      let text = '';
      if (data.content) {
        text = data.content.map(c => c.text || '').join('');
      } else if (data.choices) {
        text = data.choices[0]?.message?.content || '';
      } else if (typeof data === 'string') {
        text = data;
      }

      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = text;
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      } else {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
      }

      if (!jsonStr || !jsonStr.includes('{')) {
        throw new Error('No JSON found in response');
      }

      const extracted = JSON.parse(jsonStr.trim());
      setResults(extracted);

      // Add to archive with timestamp
      const archiveEntry = {
        id: Date.now(),
        extracted_at: new Date().toISOString(),
        schema_used: schema,
        source_text_preview: ordinanceText.substring(0, 200) + '...',
        data: extracted
      };
      setExtractions(prev => [archiveEntry, ...prev]);

    } catch (e) {
      setError('Extraction failed: ' + e.message);
      console.error('Full error:', e);
    }

    setLoading(false);
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

  // Group results by category for display
  const renderResults = (results) => {
    const classification = ['pfas_ban', 'poly_6_ban', 'rrc_required', 'straw_restriction', 'single_use_ban', 'accessories_upon_request'];
    const identification = ['instrument_number', 'jurisdiction', 'effective_date'];
    const scope = ['covered_foodware', 'covered_establishments'];
    const details = ['prohibited_materials', 'required_alternatives', 'exemptions'];
    const enforcement = ['penalties_summary', 'enforcement_agency'];
    const summary = ['plain_language_summary'];

    const renderSection = (title, keys) => {
      const sectionData = keys.filter(k => results[k] !== undefined);
      if (sectionData.length === 0) return null;
      
      return (
        <div key={title} className="results-section">
          <h3 className="section-title">{title}</h3>
          <table className="results-table">
            <tbody>
              {sectionData.map(key => (
                <tr key={key}>
                  <td className="key-cell">{key}</td>
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
      </>
    );
  };

  return (
    <div className="page">
      <h1 className="title">Ordinance Parser</h1>
      <p className="subtitle">
        Extract structured data from food ware and plastic ordinances.
      </p>

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
        onClick={extractInfo}
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
            <button
              onClick={() => downloadJSON(results, `extraction-${Date.now()}.json`)}
              className="small-button success"
            >
              Download JSON
            </button>
          </div>
          {renderResults(results)}
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
        Tip: Classification booleans help you quickly identify what type of ordinance this is before reviewing details.
      </p>
    </div>
  );
}
