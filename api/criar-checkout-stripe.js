import Stripe from 'stripe';

const ALLOWED_ORIGIN = process.env.SITE_URL || '*';
// Produto "FinanceHub PRO Essential", USD $14.99, pagamento único (já criado no Stripe).
const STRIPE_PRICE_ID = 'price_1U9poHBBsAS1lAp1tE7oCQFN';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

    if (!process.env.STRIPE_SECRET_KEY) {
        console.error('STRIPE_SECRET_KEY não configurada na Vercel.');
        return res.status(500).json({ erro: 'Erro de configuração do servidor.' });
    }

    const { userId, email } = req.body || {};
    if (!userId || !email) {
        return res.status(400).json({ erro: 'Dados incompletos para iniciar o pagamento.' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origem = process.env.SITE_URL || `https://${req.headers.host}`;

    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
            customer_email: email,
            // client_reference_id é o que o webhook usa pra saber qual conta do
            // Supabase liberar quando o pagamento for confirmado.
            client_reference_id: userId,
            success_url: `${origem}/checkout.html?stripe_retorno=sucesso`,
            cancel_url: `${origem}/checkout.html?stripe_retorno=cancelado`,
        });

        return res.status(200).json({ url: session.url });

    } catch (error) {
        console.error('Erro ao criar Checkout Session do Stripe:', error.message);
        return res.status(500).json({ erro: 'Falha ao iniciar o pagamento.' });
    }
}
