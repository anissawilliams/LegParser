from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os

app = Flask(__name__)

# Configure CORS
# In production, set FRONTEND_URL to your frontend domain
# e.g., FRONTEND_URL=https://your-frontend.netlify.app
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
CORS(app, origins=[FRONTEND_URL, "http://localhost:3000", "http://localhost:5001"])

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

if not ANTHROPIC_API_KEY:
    print("WARNING: ANTHROPIC_API_KEY environment variable not set!")
else:
    print(f"API Key loaded: {ANTHROPIC_API_KEY[:10]}...")

@app.route("/api/extract", methods=["POST"])
def extract():
    data = request.json
    
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
                "max_tokens": 1000,
                "messages": [
                    {"role": "user", "content": data["prompt"]}
                ]
            }
        )
        
        print(f"API Status Code: {resp.status_code}")
        response_data = resp.json()
        print(f"API Response: {response_data}")
        
        if resp.status_code != 200:
            return jsonify({"error": response_data}), resp.status_code
            
        return jsonify(response_data)
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/")
def home():
    return "Ordinance Parser API is running"

@app.route("/health")
def health():
    return jsonify({"status": "healthy", "api_key_set": bool(ANTHROPIC_API_KEY)})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)
