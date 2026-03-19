module.exports = async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                error: {
                    message: "Method not allowed"
                }
            });
        }

        const { prompt } = req.body || {};

        if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
            return res.status(400).json({
                error: {
                    message: "Prompt is required"
                }
            });
        }

        const lowerPrompt = prompt.toLowerCase();

        let aiReply = "Demo AI advice: Review your income and expenses carefully, reduce unnecessary spending, maintain a clear monthly budget, and build an emergency fund before making major financial decisions.";

        if (lowerPrompt.includes("save") || lowerPrompt.includes("saving")) {
            aiReply = "Demo AI advice: Start by saving a small fixed amount every week or month, automate the habit if possible, and separate emergency savings from daily spending money.";
        } else if (
            lowerPrompt.includes("invest") ||
            lowerPrompt.includes("investment")
        ) {
            aiReply = "Demo AI advice: Before investing, make sure you understand the risk level, avoid putting all your money in one place, and focus first on consistency, patience, and research.";
        } else if (
            lowerPrompt.includes("debt") ||
            lowerPrompt.includes("loan")
        ) {
            aiReply = "Demo AI advice: Pay high-interest debt first, avoid taking on new unnecessary debt, and create a repayment plan that fits your monthly cash flow.";
        } else if (
            lowerPrompt.includes("budget") ||
            lowerPrompt.includes("budgeting")
        ) {
            aiReply = "Demo AI advice: A strong budget should track income, fixed costs, variable expenses, savings, and debt payments so you can clearly see where your money is going.";
        } else if (
            lowerPrompt.includes("expense") ||
            lowerPrompt.includes("spending")
        ) {
            aiReply = "Demo AI advice: Review your recent expenses, group them into needs and wants, and cut the categories that are draining money without adding much value.";
        } else if (
            lowerPrompt.includes("income") ||
            lowerPrompt.includes("salary")
        ) {
            aiReply = "Demo AI advice: Try to increase income gradually through skill-building, side opportunities, or better planning, while keeping your spending below what you earn.";
        }

        return res.status(200).json({
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: aiReply
                            }
                        ]
                    }
                }
            ]
        });

    } catch (error) {
        console.error("Demo AI server error:", error);

        return res.status(500).json({
            error: {
                message: "AI server failed",
                details: error.message
            }
        });
    }
};