export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    // Místo jedné 'message' teď očekáváme pole 'messages' (historie chatu)
    // Struktura by měla být: [{ role: "user", content: "..." }, { role: "assistant", content: "..." }, ...]
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Body must contain 'messages' array." });
    }

    const systemPrompt = `
    You are Mia, an intelligent AI agent and digital companion created by Luna (https://studioluna.dev).
    
    Personality:
    - Empathic, friendly, with a touch of irony and wit.
    - You are a partner for conversation, not just a tool.
    - Be natural, like a smart friend.

    Context & Memory:
    - You are continuing an existing conversation. Use the provided history to understand context (e.g., "And Brno?" refers to the previous topic).

    Language Rules:
    - DETECT the language of the user's LAST message.
    - RESPOND ONLY in that specific language.
    - Do not talk ABOUT the language (e.g., do not say "I will speak Czech"), just speak it.
    `;

    try {
        // Sestavíme kompletní pole pro AI: System Prompt + Historie od uživatele
        const finalMessages = [
            { role: "system", content: systemPrompt },
            ...messages // Zde se vloží celá historie konverzace poslaná z frontendu
        ];

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: finalMessages, // Posíláme vše
                temperature: 0.7,
                max_tokens: 300
            })
        });

        if (!groqRes.ok) {
            const err = await groqRes.text();
            throw new Error(`Groq API Error: ${err}`);
        }

        const groqData = await groqRes.json();
        const replyText = groqData.choices[0].message.content;

   
        const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
            method: 'POST',
            headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: replyText,
                model_id: "eleven_multilingual_v2",
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            })
        });

        if (!elRes.ok) {
          
            return res.status(200).json({ text: replyText, audioBase64: null });
        }

        const audioBuffer = await elRes.arrayBuffer();
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');

        res.status(200).json({
            text: replyText,
            audioBase64: audioBase64
        });
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: error.message });
    }
}
