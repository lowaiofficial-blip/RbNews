import Redis from 'ioredis';
import http from 'http';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const REDIS_URL = process.env.REDIS_URL;
const RSS_URL = 'https://blog.roblox.com/feed/';
const PORT = process.env.PORT || 3000;

// Redis Bağlantısı
const redis = new Redis(REDIS_URL);

// RSS Parser
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                   block.match(/<title>(.*?)<\/title>/))?.[1] || '';
    const link = (block.match(/<link>(.*?)<\/link>/))?.[1] || '';
    const desc = (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                  block.match(/<description>(.*?)<\/description>/))?.[1] || '';
    items.push({ title, link, desc });
  }
  return items;
}

// Discord'a Gönderme
async function sendToDiscord(item) {
  const payload = {
    username: 'Roblox News',
    embeds: [{
      title: item.title.slice(0, 256),
      url: item.link,
      description: item.desc.replace(/<[^>]+>/g, '').slice(0, 300),
      color: 0xE2231A,
      footer: { text: 'Roblox News • Automated' }
    }]
  };
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) console.error('Discord hata:', res.status, await res.text());
}

// Haberleri Kontrol Etme
async function checkNews() {
  try {
    const rssRes = await fetch(RSS_URL);
    const xml = await rssRes.text();
    const items = parseRSS(xml).slice(0, 5);

    let sent = 0;
    for (const item of items) {
      if (!item.link) continue;
      const key = `sent:${item.link}`;
      const already = await redis.get(key);
      if (already) continue;
      
      await sendToDiscord(item);
      await redis.set(key, '1', 'EX', 60 * 60 * 24 * 30); // 30 gün boyunca hatırla
      sent++;
    }
    console.log(`[${new Date().toISOString()}] Kontrol edildi. Gönderilen: ${sent}`);
  } catch (err) {
    console.error('Haber kontrol hatası:', err);
  }
}

// HTTP Sunucu (UptimeRobot buraya istek atacak)
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(200);
    res.end('Roblox News Bot calisiyor');
  }
});

server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda calisiyor`);

  // Başlangıçta hemen kontrol et
  checkNews();

  // Her 10 dakikada bir haber kontrol
  setInterval(checkNews, 10 * 60 * 1000);
});
