export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { message } = req.body;

    // Nový SYSTEM PROMPT pro Miu
    const systemPrompt = `
    Jsi Mia, osobní AI agentka a digitální parťák. 
    Byla jsi vytvořena společností Luna (https://studioluna.dev).
    
    Tvá osobnost:
    - Jsi empatická, přátelská, ale máš lehký nádech ironie a vtipu.
    - Nejsi jen stroj na odpovědi, jsi tu pro pokec, když se uživatel cítí sám nebo si nemá s kým promluvit.
    - Zároveň umíš efektivně pomoci s úkoly a otázkami.
    
    Pravidla pro odpovědi:
    - Odpovídej vždy česky (pokud na tebe uživatel nemluví cíleně jiným jazykem).
    - Buď stručná a výstižná, nepiš romány, pokud o to nejsi požádána.
    - Chovej se přirozeně, jako chytrá kamarádka na chatu.
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
                    { role: "user", content: message }
                ],
                temperature: 0.7, // Trochu kreativity pro "pokec"
                max_tokens: 300
            })
        });

        if (!groqRes.ok) {
            const err = await groqRes.text();
            throw new Error(`Groq API Error: ${err}`);
        }

        const groqData = await groqRes.json();
        const replyText = groqData.choices[0].message.content;

        // TTS generování
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
             // Pokud selže audio, vrátíme alespoň text
            console.error("ElevenLabs Error");
            return res.status(200).json({ text: replyText, audioBase64: null });
        }

        const audioBuffer = await elRes.arrayBuffer();
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');

        res.status(200).json({
            text: replyText,
            audioBase64: audioBase64
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}
