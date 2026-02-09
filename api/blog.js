export default async function handler(req, res) {
  const URL = process.env.UPSTASH_REDIS_REST_URL;
  const TK = process.env.UPSTASH_REDIS_REST_TOKEN;
  const ap = process.env.ADMIN_PWD;
  const m1 = process.env.MANAGER1_PWD;
  const m2 = process.env.MANAGER2_PWD;

  const auth = (p) => {
    if (p === ap) return { r: 'admin', t: 'admin' };
    if (p === m1) return { r: 'manager', t: 'manager1' };
    if (p === m2) return { r: 'manager', t: 'manager2' };
    return null;
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${URL}/lrange/luna_posts/0/-1`, {
        headers: { Authorization: `Bearer ${TK}` }
      });
      const d = await r.json();
      const posts = (d.result || []).map(i => JSON.parse(i));
      return res.status(200).json(posts);
    }

    if (req.method === 'POST') {
      const { action, password, text, id } = req.body;
      const u = auth(password);

      if (action === 'login') {
        return u ? res.status(200).json({ success: true, role: u.r }) : res.status(401).json({ success: false });
      }

      if (action === 'post' && u) {
        const postData = JSON.stringify({ 
          id: Date.now().toString(), 
          text: text, 
          timestamp: Date.now(), 
          roleType: u.t 
        });
        
        await fetch(URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${TK}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(["LPUSH", "luna_posts", postData])
        });
        
        return res.status(200).json({ success: true });
      }

      if (action === 'delete' && u?.r === 'admin') {
        const r1 = await fetch(`${URL}/lrange/luna_posts/0/-1`, {
            headers: { Authorization: `Bearer ${TK}` }
        });
        const d1 = await r1.json();
        
        const keep = (d1.result || [])
            .map(i => JSON.parse(i))
            .filter(p => p.id !== id)
            .map(i => JSON.stringify(i));

        await fetch(URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${TK}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(["DEL", "luna_posts"])
        });

        if (keep.length > 0) {
            for (const item of keep.reverse()) {
                await fetch(URL, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${TK}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(["LPUSH", "luna_posts", item])
                });
            }
        }
        return res.status(200).json({ success: true });
      }
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
