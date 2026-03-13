import React, { useState } from 'react';
import './OrdinanceParser.css';

const DEFAULT_SCHEMA = {
  ordinance_number: {
    description: "Official ordinance/law number or identifier",
    type: "string"
  },
  jurisdiction: {
    description: "City, county, or municipality name",
    type: "string"
  },
  effective_date: {
    description: "Date the ordinance takes effect",
    type: "string"
  },
  covered_establishments: {
    description: "Types of food service establishments covered (restaurants, food trucks, etc.)",
    type: "array"
  },
  prohibited_items: {
    description: "Specific food ware items that are prohibited (polystyrene, plastic straws, etc.)",
    type: "array"
  },
  required_alternatives: {
    description: "Required alternative materials (compostable, recyclable, etc.)",
    type: "array"
  },
  exemptions: {
    description: "Any exemptions or exceptions to the requirements",
    type: "array"
  },
  penalties: {
    description: "Fines or penalties for violations",
    type: "string"
  },
  enforcement_agency: {
    description: "Agency responsible for enforcement",
    type: "string"
  },
  phase_in_dates: {
    description: "Any phased implementation dates",
    type: "array"
  },
  labeling_requirements: {
      description: "Any labeling requirements for food items or materials" +
          " (e.g. \"Recyclable\", \"Compostable\", \"Non-recyclable\")",
      type: "array"
  },
  operational_requirements: {
      description: "Any operational requirements for food items or materials" +
          " (e.g. \"Must be stored in a recycling bin\")",
      type: "array"
  },
  utensils_and_accessories_requirements:{
      description: "Any requirements for utensils and accessories" +
          " (e.g. \"Only provided per customer requests\")",
      type: "array"
  },
    provisions: {
        description:
          'Key provisions this ordinance puts into place ' +
          '(e.g. "Use of polystyrene (labeled as #6 plastic) is prohibited", ' +
          '"All restaurants and food vendors operating in the City to utilize compostable, biodegradable, or recyclable options for disposable food packaging and food ware")',
        type: "array",
        items: { type: "string" }
      },
      SKU_types:{
      description: "Any SKU types (e.g. \"Food Ware - Containers\", \"Food Ware - Utensils\")",
      type: "array"
      }
};

const SAMPLE_TEXT = `§ 5.84.030Single-use carryout plastic bags prohibited.
A. No store shall provide to any customer a single-use carryout plastic bag.
B. This prohibition applies to bags provided for the purpose of carrying away goods and does not apply to produce bags or product bags.
(Ord. 759 § 2, 2015)
§ 5.84.040Permitted bags.
All stores shall provide or make available to a customer only recyclable paper carryout bags or reusable bags for the purpose of carrying away goods or other materials from the point of sale, subject to the terms of this chapter. Nothing in this chapter prohibits customers from using bags of any type that they bring to the store themselves or from carrying away goods that are not placed in a bag, in lieu of using bags provided by the store.
(Ord. 759 § 2, 2015)
§ 5.84.050Carryout bag regulations.
A. No store shall provide a single-use carryout plastic bag to a customer, at the check stand, cash register, point of sale, or other point of departure for the purpose of transporting food or merchandise out of the establishment except as provided in this section.
B. No person shall distribute a single-use carryout plastic bag at any city facility, city-managed concession, city-sponsored event, or city-permitted event unless otherwise provided in this section.
C. Single-use carryout plastic bags may be distributed to customers by food providers for the purpose of safeguarding health and safety during the transportation of prepared take-out foods and liquids intended for consumption away from the food provider's premises.
D. A store shall make recycled paper bags available to customers for a minimum charge of ten cents per bag. The sale of each bag shall be separately itemized on the sale receipt.
E. All stores must keep records of the total number of recycled paper bags provided; the total amount of monies collected for providing recycled paper bags, and a summary of any efforts a store has undertaken to promote the use of reusable bags by customers in the prior calendar year. Such records must be made available for the city manager to review at any time. These records may be kept at the retailer's corporate office.
(Ord. 759 § 2, 2015)
§ 5.84.060Exemptions.
A store may provide a customer participating in the California Special Supplemental Food Program for Women, Infants, and Children pursuant to Article 2 (commencing with Section 123275) of Chapter 1 of Section 2 of Division 106 of the Health and Safety Code; and a customer participating in the Supplemental Food Program pursuant to Chapter 10 (commencing with Section 15500) of Part 3 of Division 9 of the California Welfare and Institutions Code, with one or more recycled paper bags or reusable bags at no cost.
(Ord. 759 § 2, 2015)
§ 5.84.070Penalties and enforcement.
A. The city manager is authorized to promulgate rules and regulations regarding the interpretation, implementation, and enforcement of this chapter and to take any and all actions reasonable and necessary to enforce this chapter.
B. Failure to comply with any provision of this chapter may be addressed by any of the remedies set forth in Title 13 of this code, or via any other remedy available at law or in equity.
(Ord. 759 § 2, 2015)`

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

    const prompt = `You are a precise legal document parser. Extract ONLY information that is EXPLICITLY stated in the provided legislative text.

CRITICAL RULES:
1. ONLY extract information that appears verbatim or is directly stated in the text
2. If a field is not found in the text, use null
3. For array fields, return an array of strings
4. For string fields, return a string
5. Include brief quotes or citations where helpful
6. DO NOT infer, assume, or hallucinate any information
7. Return ONLY valid JSON, no other text

SCHEMA TO EXTRACT:
${schemaDescription}

LEGISLATIVE TEXT:
${ordinanceText}

Return a JSON object with each schema field. Use null for any field not explicitly found in the text.`;

    try {
      const response = await fetch('http://localhost:5002/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      const data = await response.json();
      console.log('Full API response:', data);
      console.log('Response keys:', Object.keys(data));
      const text = data.content?.map(c => c.text || '').join('') || '';
      console.log('Extracted text:', text);
      console.log('Text length:', text.length);

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON match found in text:', text);
        throw new Error('No JSON found in response');
      }

      const extracted = JSON.parse(jsonMatch[0]);
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

    return (
      <div className="page">
        <h1 className="title">Ordinance Parser</h1>
        <p className="subtitle">
          Extract structured data from legislative texts. Edit the schema, paste your ordinance, and extract.
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

            <table className="results-table">
              <tbody>
                {Object.entries(results).map(([key, value]) => (
                  <tr key={key}>
                    <td className="key-cell">{key}</td>
                    <td className="value-cell">
                      {value === null ? (
                        <span className="muted">Not found</span>
                      ) : Array.isArray(value) ? (
                        <ul>
                          {value.map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                      ) : (
                        String(value)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                      {entry.data.jurisdiction || entry.data.ordinance_number || 'Untitled'}
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
          Tip: The schema is fully editable. Add/remove fields as needed for your specific ordinance types.
        </p>
      </div>
    );

}
