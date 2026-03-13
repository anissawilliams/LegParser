import React, { useState, useEffect } from 'react';
import './OrdinanceParser.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const SAMPLE_TEXT = `ORDINANCE NO. 2024-15

AN ORDINANCE OF THE CITY OF GREENVILLE PROHIBITING THE USE OF POLYSTYRENE FOAM AND PFAS-CONTAINING FOOD SERVICE WARE

Section 1. Definitions.
"Food service ware" means containers, plates, bowls, trays, cartons, cups, lids, straws, stirrers, and utensils.
"Polystyrene foam" means expanded polystyrene (EPS), commonly known as Styrofoam.
"PFAS" means perfluoroalkyl and polyfluoroalkyl substances.

Section 2. Prohibition.
(a) No food service establishment shall distribute food service ware containing polystyrene foam or PFAS.
(b) All food service ware must be compostable, recyclable, or reusable.

Section 3. Accessories Upon Request.
Single-use accessories including straws, stirrers, utensils, and condiment packets shall only be provided upon customer request.

Section 4. Covered Establishments.
This ordinance applies to all restaurants, cafes, food trucks, and grocery stores within city limits.

Section 5. Exemptions.
(a) Prepackaged food sealed before receipt.
(b) Medical facilities and healthcare providers.

Section 6. Penalties.
First violation: Written warning. Second: $100 fine. Third+: $250 fine.

Section 7. Enforcement.
The Department of Environmental Services shall enforce this ordinance.

Section 8. Effective Date.
This ordinance takes effect January 1, 2025.`;

export default function OrdinanceParser() {
  // State
  const [ordinanceText, setOrdinanceText] = useState('');
  const [results, setResults] = useState(null);
  const [shaped, setShaped] = useState(null);
  const [editedResults, setEditedResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationState, setValidationState] = useState({});
  const [activeTab, setActiveTab] = useState('core');
  const [feedback, setFeedback] = useState('');
  const [examples, setExamples] = useState([]);
  const [showExamples, setShowExamples] = useState(false);

  // Load examples on mount
  useEffect(() => {
    fetchExamples();
  }, []);

  const fetchExamples = async () => {
    try {
      const res = await fetch(`${API_URL}/api/examples`);
      const data = await res.json();
      setExamples(data.examples || []);
    } catch (e) {
      console.error('Failed to load examples:', e);
    }
  };

  // Extract
  const handleExtract = async (isRerun = false) => {
    setLoading(true);
    setError(null);

    if (!ordinanceText.trim()) {
      setError('Please paste ordinance text');
      setLoading(false);
      return;
    }

    // Build corrections from validation state
    let corrections = null;
    if (isRerun && editedResults) {
      corrections = {};
      Object.keys(validationState).forEach(key => {
        if (validationState[key] === 'edited' || validationState[key] === 'invalid') {
          corrections[key] = editedResults[key];
        }
      });
    }

    try {
      const res = await fetch(`${API_URL}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ordinanceText,
          corrections: isRerun ? corrections : null,
          feedback: isRerun ? feedback : null,
          return_shaped: true
        })
      });

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setResults(data.extracted);
      setShaped(data.shaped);
      setEditedResults(JSON.parse(JSON.stringify(data.extracted)));
      setValidationState({});
      setFeedback('');
    } catch (e) {
      setError(e.message);
    }

    setLoading(false);
  };

  // Save as example
  const handleSaveExample = async () => {
    if (!editedResults) return;

    try {
      const res = await fetch(`${API_URL}/api/examples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jurisdiction: editedResults.jurisdiction,
          ordinance_number: editedResults.ordinance_number,
          source_snippet: ordinanceText.substring(0, 500),
          rule_signals: editedResults.rule_signals,
          regulatory_logic: editedResults.regulatory_logic,
          prohibited_items: editedResults.prohibited_items,
          required_alternatives: editedResults.required_alternatives
        })
      });

      const data = await res.json();
      if (data.success) {
        alert(`Example saved! Total: ${data.total_examples}`);
        fetchExamples();
      }
    } catch (e) {
      alert('Failed to save example: ' + e.message);
    }
  };

  // Clear examples
  const handleClearExamples = async () => {
    if (!window.confirm('Clear all learned examples?')) return;

    try {
      await fetch(`${API_URL}/api/examples`, { method: 'DELETE' });
      setExamples([]);
    } catch (e) {
      alert('Failed to clear examples');
    }
  };

  // Validation helpers
  const markField = (field, status) => {
    setValidationState(prev => ({ ...prev, [field]: status }));
  };

  const updateField = (field, value) => {
    setEditedResults(prev => ({ ...prev, [field]: value }));
    setValidationState(prev => ({ ...prev, [field]: 'edited' }));
  };

  // Download
  const downloadJSON = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  // Validation stats
  const stats = {
    validated: Object.values(validationState).filter(v => v === 'valid').length,
    invalid: Object.values(validationState).filter(v => v === 'invalid').length,
    edited: Object.values(validationState).filter(v => v === 'edited').length
  };

  // Render field
  const renderField = (key, type = 'string') => {
    const status = validationState[key];
    const borderColor = status === 'valid' ? '#059669' : status === 'invalid' ? '#dc2626' : status === 'edited' ? '#d97706' : '#e5e7eb';

    return (
      <div className="editable-field" key={key}>
        <div className="field-header">
          <span className="field-name">{key}</span>
          <div className="validation-buttons">
            <button onClick={() => markField(key, 'valid')} className={`validation-btn ${status === 'valid' ? 'active' : ''}`}>✓</button>
            <button onClick={() => markField(key, 'invalid')} className={`validation-btn ${status === 'invalid' ? 'active' : ''}`}>✗</button>
          </div>
        </div>
        <div className="field-content" style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: '12px' }}>
          {type === 'array' ? (
            <textarea
              value={Array.isArray(editedResults?.[key]) ? editedResults[key].join('\n') : ''}
              onChange={(e) => updateField(key, e.target.value.split('\n').filter(Boolean))}
              className="field-textarea"
              rows={4}
            />
          ) : type === 'object' ? (
            <textarea
              value={JSON.stringify(editedResults?.[key] || {}, null, 2)}
              onChange={(e) => { try { updateField(key, JSON.parse(e.target.value)); } catch {} }}
              className="field-textarea code"
              rows={6}
            />
          ) : (
            <input
              type="text"
              value={editedResults?.[key] || ''}
              onChange={(e) => updateField(key, e.target.value)}
              className="field-input"
            />
          )}
        </div>
      </div>
    );
  };

  // Render signals
  const renderSignals = () => {
    const signals = editedResults?.rule_signals || {};
    const config = {
      contains_polystyrene_ban: { label: 'Polystyrene Ban', color: '#dc2626', icon: '🚫' },
      contains_pfas_ban: { label: 'PFAS Ban', color: '#ea580c', icon: '☠️' },
      contains_packaging_ban: { label: 'Packaging Ban', color: '#d97706', icon: '📦' },
      contains_upon_request_rule: { label: 'Upon Request', color: '#0891b2', icon: '🙋' },
      contains_alternative_requirement: { label: 'Alternatives Required', color: '#059669', icon: '♻️' },
      contains_labeling_requirement: { label: 'Labeling Required', color: '#7c3aed', icon: '🏷️' },
      contains_operational_requirement: { label: 'Operational Rules', color: '#6366f1', icon: '⚙️' }
    };

    return (
      <div className="signals-grid">
        {Object.entries(config).map(([key, cfg]) => (
          <div
            key={key}
            className={`signal-card ${signals[key] ? 'active' : ''}`}
            onClick={() => updateField('rule_signals', { ...signals, [key]: !signals[key] })}
            style={{ borderColor: signals[key] ? cfg.color : '#e5e7eb', backgroundColor: signals[key] ? `${cfg.color}15` : '#f9fafb' }}
          >
            <span className="signal-icon">{cfg.icon}</span>
            <span className="signal-label">{cfg.label}</span>
            <span className="signal-toggle" style={{ color: signals[key] ? cfg.color : '#9ca3af' }}>{signals[key] ? 'YES' : 'NO'}</span>
          </div>
        ))}
      </div>
    );
  };

  // Render logic
  const renderLogic = () => {
    const logic = editedResults?.regulatory_logic || [];
    const colors = { prohibited: '#dc2626', required: '#059669', conditional: '#d97706', exempt: '#6366f1', fee_applies: '#0891b2' };

    return (
      <div className="logic-list">
        {logic.length === 0 ? <p className="muted">No regulatory logic</p> : logic.map((rule, i) => (
          <div key={i} className="logic-card" style={{ borderLeftColor: colors[rule.assertion_outcome] || '#666' }}>
            <div className="logic-header">
              <span className="logic-type">{rule.rule_type}</span>
              <span className="logic-outcome" style={{ backgroundColor: colors[rule.assertion_outcome] || '#666' }}>{rule.assertion_outcome}</span>
            </div>
            <p className="logic-reason">{rule.reason_template}</p>
            {rule.target_materials?.length > 0 && <div className="logic-targets"><strong>Materials:</strong> {rule.target_materials.join(', ')}</div>}
            {rule.target_sku_types?.length > 0 && <div className="logic-targets"><strong>SKUs:</strong> {rule.target_sku_types.join(', ')}</div>}
          </div>
        ))}
      </div>
    );
  };

  // Render shaped output
  const renderShaped = () => {
    if (!shaped) return <p className="muted">No shaped data</p>;

    return (
      <div>
        <div className="shaped-section">
          <h4>Test Flag (PFAS Ban)</h4>
          <span className={`test-flag ${shaped.test_flag ? 'active' : ''}`}>
            {shaped.test_flag ? '✓ PFAS Ban Detected' : '✗ No PFAS Ban'}
          </span>
        </div>

        <div className="shaped-section">
          <h4>Requirements ({shaped.requirements?.length || 0})</h4>
          {shaped.requirements?.map((req, i) => (
            <div key={i} className="requirement-card">
              <strong>{req.obligation_type}</strong>: {req.requirement_details}
              <div className="req-meta">{req.sku_category} · {req.industry}</div>
            </div>
          ))}
        </div>

        <div className="shaped-section">
          <h4>SKU Requirements ({shaped.sku_requirements?.length || 0})</h4>
          {shaped.sku_requirements?.map((sku, i) => (
            <div key={i} className="sku-card">
              <strong>{sku.sku_type}</strong>
              <span className={`sku-class ${sku.classification}`}>{sku.classification}</span>
              <p>{sku.reason}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="parser-container">
      {/* Header */}
      <div className="parser-header">
        <div>
          <h1>Ordinance Parser</h1>
          <p>Extract, validate, and learn from regulatory documents</p>
        </div>
        <button onClick={() => setShowExamples(!showExamples)} className="secondary-btn">
          📚 Examples ({examples.length})
        </button>
      </div>

      {/* Examples */}
      {showExamples && (
        <div className="examples-panel">
          <div className="examples-header">
            <h3>Learned Examples</h3>
            <button onClick={handleClearExamples} className="danger-btn small">Clear All</button>
          </div>
          {examples.length === 0 ? (
            <p className="muted">No examples yet. Validate and save extractions to improve future parsing.</p>
          ) : (
            <div className="examples-list">
              {examples.map((ex, i) => (
                <div key={i} className="example-item">
                  <strong>{ex.jurisdiction} - {ex.ordinance_number}</strong>
                  <span className="example-date">{new Date(ex.saved_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main */}
      <div className="parser-main">
        {/* Left: Input */}
        <div className="input-panel">
          <div className="panel-header">
            <h3>Source Text</h3>
            <button onClick={() => setOrdinanceText(SAMPLE_TEXT)} className="link-btn">Load Sample</button>
          </div>
          <textarea
            value={ordinanceText}
            onChange={(e) => setOrdinanceText(e.target.value)}
            placeholder="Paste ordinance text..."
            className="source-textarea"
          />
          <button onClick={() => handleExtract(false)} disabled={loading} className="extract-btn">
            {loading ? 'Extracting...' : '🔍 Extract'}
          </button>
        </div>

        {/* Right: Results */}
        <div className="results-panel">
          {error && <div className="error-box">{error}</div>}

          {results && (
            <>
              {/* Validation bar */}
              <div className="validation-bar">
                <div className="validation-stats">
                  <span className="stat valid">✓ {stats.validated}</span>
                  <span className="stat invalid">✗ {stats.invalid}</span>
                  <span className="stat edited">✎ {stats.edited}</span>
                </div>
                <div className="validation-actions">
                  <button onClick={handleSaveExample} className="success-btn small">💾 Save Example</button>
                  <button onClick={() => downloadJSON(editedResults, `ordinance-${Date.now()}.json`)} className="secondary-btn small">📥 Download</button>
                </div>
              </div>

              {/* Tabs */}
              <div className="results-tabs">
                {['core', 'signals', 'logic', 'shaped', 'raw'].map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`tab-btn ${activeTab === tab ? 'active' : ''}`}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="tab-content">
                {activeTab === 'core' && (
                  <div className="fields-grid">
                    {renderField('jurisdiction')}
                    {renderField('ordinance_number')}
                    {renderField('effective_date')}
                    {renderField('overview')}
                    {renderField('covered_establishments', 'array')}
                    {renderField('prohibited_items', 'array')}
                    {renderField('required_alternatives', 'array')}
                    {renderField('exemptions', 'array')}
                    {renderField('penalties')}
                    {renderField('enforcement_agency')}
                    {renderField('provisions', 'array')}
                    {renderField('SKU_types', 'array')}
                  </div>
                )}
                {activeTab === 'signals' && renderSignals()}
                {activeTab === 'logic' && renderLogic()}
                {activeTab === 'shaped' && renderShaped()}
                {activeTab === 'raw' && (
                  <textarea
                    value={JSON.stringify(editedResults, null, 2)}
                    onChange={(e) => { try { setEditedResults(JSON.parse(e.target.value)); } catch {} }}
                    className="raw-json-textarea"
                  />
                )}
              </div>

              {/* Re-run */}
              {(stats.invalid > 0 || stats.edited > 0) && (
                <div className="rerun-section">
                  <h4>🔄 Re-extract with Corrections</h4>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Optional guidance..."
                    className="feedback-textarea"
                  />
                  <button onClick={() => handleExtract(true)} disabled={loading} className="rerun-btn">
                    {loading ? 'Re-extracting...' : '🔄 Re-extract'}
                  </button>
                </div>
              )}
            </>
          )}

          {!results && !loading && <div className="empty-state">Paste text and click Extract</div>}
        </div>
      </div>
    </div>
  );
}
