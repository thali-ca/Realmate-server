const express = require('express');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'RealMate server is running' });
});

// Receive a new lead
app.post('/lead', async (req, res) => {
  const { name, email, source, message, interest, budget, intent, urgency } = req.body;

  // Save lead to Supabase
  const { data: lead, error } = await supabase
    .from('leads')
    .insert([{ name, email, source, message, interest, budget, intent, urgency }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Generate AI reply
  const aiReply = await generateReply({ name, source, message, interest, budget, intent });

  // Save AI reply
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
  const updates = req.body;

  const { error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

async function generateReply({ name, source, message, interest, budget, intent }) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a top real estate agent named Sarah. A new lead just messaged you. Write a warm, helpful reply.

Source: ${source === 'fb' ? 'Facebook Messenger' : 'Email'}
Lead name: ${name}
Their message: "${message}"
Intent: ${intent}
Budget: ${budget}
Interest: ${interest}

Rules:
- Sound human, not like a bot
- 3-4 short paragraphs max
- Ask ONE qualifying question at the end
- Sign off as Sarah`
        }]
      })
    });
    const data = await response.json();
    return data.content?.[0]?.text || 'Could not generate reply.';
  } catch (e) {
    return 'AI reply generation failed.';
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RealMate server running on port ${PORT}`));
