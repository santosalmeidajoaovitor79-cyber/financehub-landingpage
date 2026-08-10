const { MercadoPagoConfig, Payment } = require('mercadopago');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

    try {
        const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_TOKEN });
        
        const { nome, email, cpf } = req.body;
        const cpfLimpo = cpf.replace(/\D/g, ''); 

        const payment = new Payment(client);
        const response = await payment.create({
            body: {
                transaction_amount: 19.90,
                description: 'FinanceHub PRO Essential',
                payment_method_id: 'pix',
                payer: {
                    email: email,
                    first_name: nome,
                    identification: { type: 'CPF', number: cpfLimpo }
                }
            }
        });

        return res.status(200).json({
            id_pagamento: response.id,
            qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
            copia_e_cola: response.point_of_interaction.transaction_data.qr_code
        });

    } catch (error) {
        console.error("Erro na API:", error);
        return res.status(500).json({ erro: 'Falha ao processar o PIX no Mercado Pago' });
    }
}
