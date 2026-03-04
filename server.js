const express  = require('express');
const session  = require('express-session');
const axios    = require('axios');
const path     = require('path');
const fs       = require('fs');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID     = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI;
const SERVER_ID     = process.env.DISCORD_SERVER_ID;
const TEAM_ROLE_ID  = process.env.TEAM_ROLE_ID;

// Data file for applications
const BEW_FILE = path.join(__dirname, 'bewerbungen.json');
function loadBew(){ try{ return JSON.parse(fs.readFileSync(BEW_FILE,'utf8')); }catch{ return []; } }
function saveBew(data){ fs.writeFileSync(BEW_FILE, JSON.stringify(data, null, 2)); }

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'maxberger2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 }
}));

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'publicpanel.html')));
app.get('/panel.html', (req, res) => res.sendFile(path.join(__dirname, 'publicpanel.html')));
app.get('/bewerbung', (req, res) => res.sendFile(path.join(__dirname, 'bewerbung.html')));

app.get('/auth/discord', (req, res) => {
  const url = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
    response_type: 'code', scope: 'identify guilds.members.read',
  });
  res.redirect('https://discord.com/api/oauth2/authorize?' + url);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/panel.html?error=1');
  try {
    const token = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token, token_type } = token.data;
    const auth = `${token_type} ${access_token}`;
    const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: auth } });
    const user = userRes.data;
    let hasAccess = false; let roles = [];
    try {
      const memberRes = await axios.get(`https://discord.com/api/users/@me/guilds/${SERVER_ID}/member`, { headers: { Authorization: auth } });
      roles = memberRes.data.roles || [];
      hasAccess = TEAM_ROLE_ID ? roles.includes(TEAM_ROLE_ID) : true;
    } catch { hasAccess = false; }
    if (!hasAccess) return res.redirect('/panel.html?error=kein_zugang');
    req.session.user = {
      id: user.id, username: user.username,
      global_name: user.global_name || user.username,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png',
      roles,
    };
    res.redirect('/panel.html');
  } catch (err) {
    console.error(err?.response?.data || err.message);
    res.redirect('/panel.html?error=1');
  }
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: req.session.user });
});

app.post('/api/bewerbung', (req, res) => {
  const { name, discord, age, reason, experience } = req.body;
  if (!name || !discord) return res.status(400).json({ error: 'Fehlende Felder' });
  const bew = loadBew();
  bew.unshift({ id: Date.now(), name, discord, age, reason, experience, status: 'offen', date: new Date().toLocaleDateString('de-DE') });
  saveBew(bew);
  res.json({ ok: true });
});

app.get('/api/bewerbungen', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Nicht eingeloggt' });
  res.json(loadBew());
});

app.get('/auth/logout', (req, res) => { req.session.destroy(); res.redirect('/panel.html'); });

app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
