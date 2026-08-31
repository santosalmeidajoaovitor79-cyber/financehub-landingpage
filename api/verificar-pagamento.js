import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';
import { obterProdutos } from '../lib/produtos.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });

    try {
        const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_TOKEN });
        const payment = new Payment(client);

        const paymentId = req.query.id;
        if (!paymentId) return res.status(400).json({ erro: 'ID de pagamento não informado.' });

        const response = await payment.get({ id: paymentId });

        // Este era o pedaço que faltava: sem isso, o pagamento aparecia como aprovado
        // na tela, mas o Supabase nunca sabia que o cliente pagou.
        if (response.status === 'approved' && response.external_reference) {
            const [userId, produto] = response.external_reference.split(':');
            const config = obterProdutos(produto || 'financehub');

            if (config && userId) {
                const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
                // Um update por produto do combo — o filtro .eq(campoPago, false) evita
                // reprocessar o mesmo produto a cada nova checagem (o front consulta essa
                // rota de 3 em 3 segundos enquanto o PIX não é confirmado).
                for (const p of config.produtos) {
                    await supabase
                        .from('profiles')
                        .update({ [p.campoPago]: true, [p.campoFormaPagamento]: 'pix' })
                        .eq('id', userId)
                        .eq(p.campoPago, false);
                }
            }
        }

        return res.status(200).json({ status: response.status });

    } catch (error) {
        console.error('Erro ao verificar pagamento:', error);
        return res.status(500).json({ erro: 'Falha ao verificar status' });
    }
}
