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

  if (req.method === 'GET') {
    const r = await fetch(`${URL}/lrange/luna_posts/0/-1`, { headers: { Authorization: `Bearer ${TK}` } });
    const d = await r.json();
    const data = (d.result || []).map(i => JSON.parse(i));
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { action, password, text, id } = req.body;
    const u = auth(password);

    if (action === 'login') {
      return u ? res.status(200).json({ success: true, role: u.r }) : res.status(401).json({ success: false });
    }

    if (action === 'post' && u) {
      const p = JSON.stringify({ id: Date.now().toString(), text, timestamp: Date.now(), roleType: u.t });
      await fetch(`${URL}/lpush/luna_posts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TK}` },
        body: p
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'delete' && u?.r === 'admin') {
      const r = await fetch(`${URL}/lrange/luna_posts/0/-1`, { headers: { Authorization: `Bearer ${TK}` } });
      const d = await r.json();
      const filtered = (d.result || []).map(i => JSON.parse(i)).filter(item => item.id !== id).map(i => JSON.stringify(i));
      
      await fetch(`${URL}/del/luna_posts`, { headers: { Authorization: `Bearer ${TK}` } });
      
      if (filtered.length > 0) {
        for (const item of filtered.reverse()) {
          await fetch(`${URL}/lpush/luna_posts`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${TK}` },
            body: item
          });
        }
      }
      return res.status(200).json({ success: true });
    }
  }
}
