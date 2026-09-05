import Stripe from 'stripe';
import { obterProdutos } from '../lib/produtos.js';

const ALLOWED_ORIGIN = process.env.SITE_URL || '*';

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

    const { userId, email, produto } = req.body || {};
    const produtoId = produto || 'financehub';
    const config = obterProdutos(produtoId);
    if (!config) return res.status(400).json({ erro: 'Produto inválido.' });
    if (!userId || !email) {
        return res.status(400).json({ erro: 'Dados incompletos para iniciar o pagamento.' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origem = process.env.SITE_URL || `https://${req.headers.host}`;

    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            // Sem payment_method_types fixo: o Stripe decide sozinho (via "Dynamic
            // Payment Methods") quais formas mostrar, com base no que estiver
            // habilitado no Dashboard (Settings > Payment methods) — Link, Cash App
            // Pay, Apple Pay, Google Pay etc. aparecem automaticamente pra quem for
            // elegível, sem precisar mexer aqui de novo a cada nova forma ativada.
            // Um line_item por produto do combo — o Stripe soma o total sozinho.
            line_items: config.produtos.map(p => ({ price: p.stripePriceId, quantity: 1 })),
            customer_email: email,
            // client_reference_id é o que o webhook usa pra saber qual conta E qual
            // produto liberar no Supabase quando o pagamento for confirmado.
            client_reference_id: `${userId}:${produtoId}`,
            success_url: `${origem}/checkout.html?produto=${produtoId}&stripe_retorno=sucesso`,
            cancel_url: `${origem}/checkout.html?produto=${produtoId}&stripe_retorno=cancelado`,
        });

        return res.status(200).json({ url: session.url });

    } catch (error) {
        console.error('Erro ao criar Checkout Session do Stripe:', error.message);
        return res.status(500).json({ erro: 'Falha ao iniciar o pagamento.' });
    }
}
