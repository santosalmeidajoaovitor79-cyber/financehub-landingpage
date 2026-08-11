import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGIN = process.env.SITE_URL || '*';

// IMPORTANTE: este endpoint NUNCA deve receber número de cartão, validade ou CVC em texto puro.
// Ele espera o "token" já gerado no navegador pelo Card Payment Brick do Mercado Pago,
// que faz a tokenização do cartão sem esses dados passarem pelo seu servidor.
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

    try {
        const {
            token, issuer_id, payment_method_id, installments,
            email, cpf, userId
        } = req.body || {};

        if (!token || !payment_method_id || !email || !cpf || !userId) {
            return res.status(400).json({ erro: 'Dados do pagamento incompletos.' });
        }

        const cpfLimpo = String(cpf).replace(/\D/g, '');

        const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_TOKEN });
        const payment = new Payment(client);

        const response = await payment.create({
            body: {
                transaction_amount: 19.90,
                token,
                description: 'FinanceHub PRO Essential',
                installments: Number(installments) || 1,
                payment_method_id,
                issuer_id,
                payer: {
                    email,
                    identification: {
                        type: cpfLimpo.length === 11 ? 'CPF' : 'CNPJ',
                        number: cpfLimpo
                    }
                }
            }
        });

        const aprovado = response.status === 'approved';

        if (aprovado) {
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
            await supabase.from('profiles').update({ pago: true }).eq('id', userId);
        }

        return res.status(200).json({
            status: response.status,
            status_detail: response.status_detail,
            aprovado
        });

    } catch (error) {
        console.error('Erro ao processar cartão:', error);
        return res.status(500).json({ erro: 'Falha ao processar o pagamento no cartão.' });
    }
}
