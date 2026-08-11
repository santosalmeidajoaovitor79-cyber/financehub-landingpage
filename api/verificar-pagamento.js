const { MercadoPagoConfig, Payment } = require('mercadopago');

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });

    try {
        const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_TOKEN });
        const payment = new Payment(client);
        
        // Pega o ID do pagamento que o site mandou perguntar
        const paymentId = req.query.id;
        
        // Pergunta ao Mercado Pago o status oficial desse ID
        const response = await payment.get({ id: paymentId });
        
        // Retorna o status para o seu checkout (ex: "pending", "approved", "rejected")
        return res.status(200).json({ status: response.status });
    } catch (error) {
        console.error("Erro ao verificar pagamento:", error);
        return res.status(500).json({ erro: 'Falha ao verificar status' });
    }
}
