// Catálogo compartilhado dos produtos vendidos no site. Fica fora de /api
// (Vercel trata todo arquivo dentro de /api como uma rota própria).
export const PRODUTOS = {
    financehub: {
        descricaoMp: 'FinanceHub PRO Essential',
        precoBRL: 42.35,
        precoUSD: 14.99,
        stripePriceId: 'price_1U9poHBBsAS1lAp1tE7oCQFN',
        campoPago: 'pago',
        campoFormaPagamento: 'forma_pagamento',
    },
    'ebook-fluxo-caixa': {
        descricaoMp: 'Fluxo de Caixa na Prática (E-book)',
        precoBRL: 27.90,
        precoUSD: 9.99,
        stripePriceId: 'price_1U9qMtBBsAS1lAp1XPNRPdsS',
        campoPago: 'ebook_pago',
        campoFormaPagamento: 'ebook_forma_pagamento',
    },
};

export function obterProduto(id) {
    return PRODUTOS[id] || null;
}

// Resolve um id "combinado" (ex: "financehub+ebook-fluxo-caixa", separado por "+")
// pra suportar venda casada/carrinho com mais de um produto num único pagamento.
// Um id simples (sem "+") continua funcionando normalmente.
export function obterProdutos(idsCombinados) {
    const ids = String(idsCombinados || 'financehub').split('+').filter(Boolean);
    const produtos = ids
        .map(id => PRODUTOS[id] ? { id, ...PRODUTOS[id] } : null)
        .filter(Boolean);

    if (!produtos.length) return null;

    return {
        ids: produtos.map(p => p.id),
        produtos,
        precoBRL: produtos.reduce((soma, p) => soma + p.precoBRL, 0),
        precoUSD: produtos.reduce((soma, p) => soma + p.precoUSD, 0),
        descricaoMp: produtos.map(p => p.descricaoMp).join(' + '),
    };
}
