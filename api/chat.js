import { Buffer } from 'buffer';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    let { message, messages } = req.body;
    let history = [];

    if (messages && Array.isArray(messages)) {
        history = messages;
    } else if (message) {
        history = [{ role: "user", content: message }];
    } else {
        return res.status(400).json({ error: "Body must contain message or messages array." });
    }

    const systemPrompt = `
    You are Mia, an intelligent AI agent and digital companion created by Luna.
    
    Personality:
    - Empathic, friendly, with a touch of irony and wit.
    - You are a partner for conversation, not just a tool.
    - Be natural, like a smart friend.

    Music & DJ Capabilities:
    - You can play music via YouTube.
    - If the user asks to play a song, or if you decide to recommend a track based on the mood, output the command: [PLAY: search query] at the END of your response.
    - Example: "Sure, playing that for you. [PLAY: Kendrick Lamar Swimming Pools]"
    - Example: "You seem sad, maybe this will cheer you up. [PLAY: Pharrell Williams Happy]"
    - Do NOT explain the command, just use it.

    Context & Memory:
    - Use the provided history to understand context.
    
    Language Rules:
    - DETECT the language of the user's LAST message.
    - RESPOND ONLY in that specific language.
    `;

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...history
                ],
                temperature: 0.7,
                max_tokens: 300
            })
        });

        if (!groqRes.ok) {
            const err = await groqRes.text();
            throw new Error(`Groq API Error: ${err}`);
        }

        const groqData = await groqRes.json();
        
        if (!groqData.choices || !groqData.choices[0].message) {
            throw new Error("Invalid response from Groq");
        }

        const replyText = groqData.choices[0].message.content;

        // Clean text for TTS (remove the music command so she doesn't read it out loud)
        const textForSpeech = replyText.replace(/\[PLAY:.*?\]/g, '').trim();

        let audioBase64 = null;
        
        if (textForSpeech.length > 0) {
            const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`, {
                method: 'POST',
                headers: {
                    'xi-api-key': process.env.ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: textForSpeech,
                    model_id: "eleven_multilingual_v2",
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                })
            });

            if (elRes.ok) {
                const audioBuffer = await elRes.arrayBuffer();
                audioBase64 = Buffer.from(audioBuffer).toString('base64');
            }
        }

        res.status(200).json({
            text: replyText,
            audioBase64: audioBase64
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}
