module.exports = async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const { prompt } = req.body || {};

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({
                error: "Missing GEMINI_API_KEY in Vercel environment variables"
            });
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: prompt }]
                        }
                    ]
                })
            }
        );

        const data = await response.json();

        console.log("Gemini API response:", JSON.stringify(data));

        return res.status(response.status).json(data);

    } catch (error) {
        console.error("Server error:", error);

        return res.status(500).json({
            error: "AI server failed",
            details: error.message
        });
    }
};