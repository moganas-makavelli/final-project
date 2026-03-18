export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        console.log("API KEY EXISTS:", !!process.env.GEMINI_API_KEY);

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: prompt }],
                        },
                    ],
                }),
            }
        );

        const data = await response.json();

        console.log("FULL Gemini response:", JSON.stringify(data, null, 2));

        // ✅ If Gemini returns an error, forward it properly
        if (data.error) {
            return res.status(500).json({
                error: data.error.message || "Unknown Gemini error",
            });
        }

        // ✅ If response is missing candidates
        if (!data.candidates) {
            return res.status(500).json({
                error: "No candidates returned from Gemini",
            });
        }

        return res.status(200).json(data);