const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();

// Permite que o seu site HTML consiga conversar com este servidor
app.use(cors());
app.use(express.json());

// ⚠️ AQUI ENTRA O SEU ACCESS TOKEN (Ninguém além de você vê isso)
const client = new MercadoPagoConfig({ accessToken: 'TEST-SEU-ACCESS-TOKEN-AQUI' });

// Rota que o seu site vai chamar quando o cliente clicar em "Gerar PIX"
app.post('/gerar-pix', async (req, res) => {
    try {
        // Recebe os dados do formulário do seu site
        const { nome, email, cpf } = req.body;

        // Limpa o CPF (tira pontos e traços para o Mercado Pago aceitar)
        const cpfLimpo = cpf.replace(/\D/g, '');

        const payment = new Payment(client);
        
        // Cria a cobrança no Mercado Pago
        const response = await payment.create({
            body: {
                transaction_amount: 19.90, // Valor cravado
                description: 'FinanceHub PRO Essential',
                payment_method_id: 'pix',
                payer: {
                    email: email,
                    first_name: nome,
                    identification: {
                        type: 'CPF',
                        number: cpfLimpo
                    }
                }
            }
        });

        // Devolve o PIX pronto para o seu site mostrar na tela
        res.status(200).json({
            id_pagamento: response.id,
            qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
            copia_e_cola: response.point_of_interaction.transaction_data.qr_code
        });

    } catch (error) {
        console.error("Erro ao gerar o PIX:", error);
        res.status(500).json({ erro: 'Falha ao processar o pagamento' });
    }
});

// Liga o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de Pagamentos rodando na porta ${PORT}`);
});
