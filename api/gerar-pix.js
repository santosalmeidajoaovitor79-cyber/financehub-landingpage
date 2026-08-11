import { MercadoPagoConfig, Payment } from 'mercadopago';

const ALLOWED_ORIGIN = process.env.SITE_URL || '*';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

    try {
        const { nome, email, cpf, userId } = req.body || {};

        if (!nome || !email || !cpf || !userId) {
            return res.status(400).json({ erro: 'Dados incompletos para gerar o PIX.' });
        }

        const cpfLimpo = String(cpf).replace(/\D/g, '');
        if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) {
            return res.status(400).json({ erro: 'CPF/CNPJ inválido.' });
        }

        const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_TOKEN });
        const payment = new Payment(client);

        const response = await payment.create({
            body: {
                transaction_amount: 19.90,
                description: 'FinanceHub PRO Essential',
                payment_method_id: 'pix',
                // Guarda o userId no pagamento -> é o que permite ao /api/verificar-pagamento
                // saber qual conta do Supabase marcar como paga quando o PIX for aprovado.
                external_reference: userId,
                payer: {
                    email,
                    first_name: nome,
                    identification: {
                        type: cpfLimpo.length === 11 ? 'CPF' : 'CNPJ',
                        number: cpfLimpo
                    }
                }
            }
        });

        return res.status(200).json({
            id_pagamento: response.id,
            qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
            copia_e_cola: response.point_of_interaction.transaction_data.qr_code
        });

    } catch (error) {
        console.error('Erro ao gerar PIX:', error);
        return res.status(500).json({ erro: 'Falha ao processar o PIX no Mercado Pago.' });
    }
}
