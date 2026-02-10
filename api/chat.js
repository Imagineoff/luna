export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { history, turnstileToken } = req.body;

    if (!turnstileToken) {
        return res.status(403).json({ error: 'Token missing' });
    }

    try {
        const cfVerify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: process.env.CLOUDFLARE_SECRET_KEY,
                response: turnstileToken
            })
        });

        const cfData = await cfVerify.json();
        if (!cfData.success) {
            return res.status(403).json({ error: 'Invalid token' });
        }

        const systemPrompt = `You are Mia, a sophisticated AI assistant. you provide helpful, clear text responses.`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history
        ];

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: messages,
                temperature: 0.7,
                max_tokens: 300
            })
        });

        if (!groqRes.ok) throw new Error(groqRes.statusText);
        const groqData = await groqRes.json();
        const rawReply = groqData.choices[0].message.content;

        res.status(200).json({
            text: rawReply
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}
