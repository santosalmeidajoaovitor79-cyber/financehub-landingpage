import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { obterProdutos } from '../lib/produtos.js';

// O Stripe exige o corpo BRUTO (não parseado) da requisição pra validar a assinatura
// do webhook — por isso desligamos o bodyParser padrão da Vercel só nessa rota.
export const config = {
    api: {
        bodyParser: false,
    },
};

function lerCorpoBruto(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Método não permitido');

    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('Variáveis do Stripe/Supabase não configuradas na Vercel.');
        return res.status(500).send('Erro de configuração do servidor.');
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const corpoBruto = await lerCorpoBruto(req);
    const assinatura = req.headers['stripe-signature'];

    let evento;
    try {
        evento = stripe.webhooks.constructEvent(corpoBruto, assinatura, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Assinatura do webhook do Stripe inválida:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (evento.type === 'checkout.session.completed') {
        const session = evento.data.object;
        const [userId, produto] = (session.client_reference_id || '').split(':');
        const config = obterProdutos(produto || 'financehub');

        if (userId && config) {
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
            // Um update por produto do combo (venda casada) — mesmo padrão do
            // verificar-pagamento.js (Mercado Pago), preservando a checagem de
            // idempotência por produto.
            for (const p of config.produtos) {
                const { error } = await supabase
                    .from('profiles')
                    .update({ [p.campoPago]: true, [p.campoFormaPagamento]: 'stripe' })
                    .eq('id', userId)
                    .eq(p.campoPago, false);

                if (error) {
                    console.error('Erro ao liberar acesso via webhook do Stripe:', error.message);
                    return res.status(500).send('Erro ao atualizar o Supabase.');
                }
            }
        } else {
            console.error('Webhook do Stripe sem client_reference_id válido — não deu pra saber qual conta liberar.');
        }
    }

    return res.status(200).json({ received: true });
}
