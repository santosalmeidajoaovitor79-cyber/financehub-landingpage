// Arquivo: api/criar-conta.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // Bloqueia se não for uma requisição POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const { nome, cpf, email, password } = req.body;

    // Puxando as chaves escondidas da Vercel (Environment Variables)
    // Lembre-se de cadastrar essas variáveis no painel da Vercel!
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Conecta ao Supabase usando a chave secreta de servidor
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // Cria o usuário pelo painel de admin do Supabase (Backend)
        const { data, error } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true, // Já confirma o e-mail automaticamente
            user_metadata: {
                full_name: nome,
                cpf: cpf,
                pagamento_status: 'pendente' // Salva o status do PIX
            }
        });

        if (error) throw error;

        // Sucesso! Retorna para o HTML avisando que a conta foi criada.
        // AQUI VOCÊ TAMBÉM PODE CHAMAR A SUA FUNÇÃO DE GERAR O PIX
        return res.status(200).json({ 
            success: true, 
            message: 'Conta criada com sucesso!',
            userId: data.user.id
        });

    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
}
