# Ordinance Parser

A Flask + React tool for extracting structured data from legislative texts using Claude AI.

## Features

- **Customizable Schema:** Edit the extraction schema to match your specific ordinance types
- **AI-Powered Extraction:** Uses Claude Sonnet 4 to intelligently parse legislative text
- **Extraction Archive:** Automatically saves all extractions with timestamps
- **JSON Export:** Download individual extractions or entire archive as JSON
- **Sample Data:** Includes sample ordinance for testing

## Local Development

### Backend (Flask)

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set environment variable:
```bash
export ANTHROPIC_API_KEY=your-api-key-here
```

3. Run the server:
```bash
python app.py
```

The API will run on http://localhost:5001

### Frontend (React)

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm start
```

The app will open at http://localhost:3000

## Usage

1. **Edit the schema** (left panel) to define what data you want to extract
2. **Paste ordinance text** (right panel) or click "Load sample" to test
3. **Click "Extract Information"** to run the AI parser
4. **View results** in the table below
5. **Download JSON** for individual extractions or the full archive

## Schema Format

The schema is a JSON object where each field has:
- `description`: What to extract
- `type`: Data type (`string`, `array`, etc.)

Example:
```json
{
  "ordinance_number": {
    "description": "Official ordinance number",
    "type": "string"
  },
  "prohibited_items": {
    "description": "Items that are prohibited",
    "type": "array"
  }
}
```

## API Endpoints

### `POST /api/extract`
Extract structured data from ordinance text.

**Request:**
```json
{
  "prompt": "Your extraction prompt with schema and text..."
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ordinance_number\": \"759\", ...}"
    }
  ]
}
```

### `GET /health`
Health check endpoint.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions for Render.

## Environment Variables

### Backend
- `ANTHROPIC_API_KEY` (required): Your Anthropic API key
- `FRONTEND_URL` (optional): Frontend URL for CORS (default: http://localhost:3000)
- `PORT` (optional): Port to run on (default: 5001)

### Frontend
- `REACT_APP_API_URL` (optional): Backend API URL (default: http://localhost:5001)

## Tech Stack

- **Backend:** Flask, Claude API (Sonnet 4)
- **Frontend:** React, JavaScript
- **Deployment:** Render (recommended)

## License

MIT
