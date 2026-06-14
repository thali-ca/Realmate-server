const express = require('express');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const GROQ_KEY = process.env.GROQ_KEY;

app.get('/', (req, res) => {
  res.json({ status: 'RealMate server is running' });
});

app.post('/ai', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt' });
  const reply = await callGroq(prompt);
  res.json({ reply });
});

app.post('/lead', async (req, res) => {
  const { name, email, source, message, interest, budget, intent, urgency, agent_id } = req.body;
  const { data: lead, error } = await supabase
    .from('leads')
    .insert([{ name, email, source, message, interest, budget, intent, urgency, agent_id }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  const aiReply = await callGroq(`You are top real estate agent Sarah. A lead messaged you. Write a warm helpful reply.\n\nSource: ${source==='fb'?'Facebook':'Email'}\nName: ${name}\nMessage: "${message}"\nIntent: ${intent}\nBudget: ${budget}\n\nRules: sound human, 3-4 paragraphs, ask ONE qualifying question, sign off as Sarah.`);
  await supabase.from('leads').update({ ai_reply: aiReply }).eq('id', lead.id);
  res.json({ success: true, lead_id: lead.id, ai_reply: aiReply });
});

app.get('/leads', async (req, res) => {
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.patch('/lead/:id', async (req, res) => {
  const { error } = await supabase.from('leads').update(req.body).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

async function callGroq(prompt) {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        max_tokens: 1000,
        messages: [
          { role: 'system', content: 'You are a helpful real estate AI assistant. Be concise and professional.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    const d = await r.json();
    return d.choices?.[0]?.message?.content || 'Could not generate response.';
  } catch(e) { return 'AI generation failed.'; }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RealMate server running on port ${PORT}`));
