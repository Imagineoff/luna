export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { history, turnstileToken } = req.body;
    if (!turnstileToken) {
        return res.status(403).json({ error: 'Missing Cloudflare token' });
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
            return res.status(403).json({ error: 'Human verification failed' });
        }
        const systemPrompt = `
You are Mia, an intelligent AI agent by Luna.

Guidelines:
1. Memory: Use the provided conversation history for context.
2. Language: Mirror the user's language (Czech/English).
3. Voice-only: The assistant will be presented to the user as voice. Still return the assistant's reply text so the frontend can speak it, but the frontend will not permanently display assistant text.
4. Music control:
   - If you want the assistant to play music, START your response with:
     ###MUSIC: Search Query###
   - If you want to provide additional research or recommended tracks/queries for the player, include:
     ###MUSICINFO:
     <plain text or JSON with suggestions>
     ###
   - After blocks, include the natural speech text to be spoken by the assistant.
5. Taste learning: If the user mentions preferences, emit a block:
   ###PROFILE:
   genre=...
   vibe=...
   artist=...
   ###
6. Keep speech concise but informative.
`;
        const messages = [
            { role: "system", content: systemPrompt },
            ...(history || [])
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
                max_tokens: 600
            })
        });
        if (!groqRes.ok) {
            const text = await groqRes.text();
            throw new Error(`Groq API Error: ${groqRes.status} ${text}`);
        }
        const groqData = await groqRes.json();
        const rawReply = groqData.choices?.[0]?.message?.content || '';
        let musicQuery = null;
        let musicInfo = null;
        let finalSpeechText = rawReply;
        const musicRegex = /###MUSIC:\s*([\s\S]*?)###/;
        const musicInfoRegex = /###MUSICINFO:\s*([\s\S]*?)###/;
        const matchMusic = rawReply.match(musicRegex);
        const matchInfo = rawReply.match(musicInfoRegex);
        if (matchMusic) {
            musicQuery = matchMusic[1].trim();
            finalSpeechText = finalSpeechText.replace(matchMusic[0], '').trim();
        }
        if (matchInfo) {
            musicInfo = matchInfo[1].trim();
            finalSpeechText = finalSpeechText.replace(matchInfo[0], '').trim();
        }
        res.status(200).json({
            text: finalSpeechText,
            musicQuery: musicQuery,
            musicInfo: musicInfo
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}
