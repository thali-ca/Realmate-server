const express = require('express');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const GROQ_KEY = process.env.GROQ_KEY;

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'RealMate server is running' });
});

// Receive a new lead
app.post('/lead', async (req, res) => {
  const { name, email, source, message, interest, budget, intent, urgency } = req.body;

  const { data: lead, error } = await supabase
    .from('leads')
    .insert([{ name, email, source, message, interest, budget, intent, urgency }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const aiReply = await generateReply({ name, source, message, interest, budget, intent });

  await supabase
    .from('leads')
    .update({ ai_reply: aiReply })
    .eq('id', lead.id);

  res.json({ success: true, lead_id: lead.id, ai_reply: aiReply });
});

// Get all leads
app.get('/leads', async (req, res) => {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Update lead status
app.patch('/lead/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('leads')
    .update(req.body)
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

async function generateReply({ name, source, message, interest, budget, intent }) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        max_tokens: 1000,
        messages: [
          {
            role: 'system',
            content: 'You are a top real estate agent named Sarah. Write warm, helpful, human replies to leads. Never sound like a bot.'
          },
          {
            role: 'user',
            content: `A new lead just messaged you.

Source: ${source === 'fb' ? 'Facebook Messenger' : 'Email'}
Lead name: ${name}
Their message: "${message}"
Intent: ${intent}
Budget: ${budget}
Interest: ${interest}

Write a reply: 3-4 short paragraphs, ask ONE qualifying question at the end, sign off as Sarah.`
          }
        ]
      })
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Could not generate reply.';
  } catch (e) {
    return 'AI reply generation failed.';
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RealMate server running on port ${PORT}`));
