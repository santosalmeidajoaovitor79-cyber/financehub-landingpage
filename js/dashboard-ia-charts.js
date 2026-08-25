const CORES = {
    navy: '#0F1E3C',
    gold: '#C9A24B',
    ivory: '#F5F3EC',
    cinza: '#5B6472',
    vermelho: '#8C1D1D',
};

function formatarValor(valor, formato) {
    const numero = Number(valor) || 0;
    if (formato === 'moeda') {
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    if (formato === 'percentual') {
        return `${numero.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    }
    return numero.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function renderizarGrafico(canvas, grafico, labels, valores) {
    const paletaCategorica = [CORES.navy, CORES.gold, '#5B84A8', '#D9C08A', '#8AA0B8', '#E4D3A8'];
    const tipo = grafico.tipo === 'pie' ? 'pie' : grafico.tipo;

    return new Chart(canvas, {
        type: tipo,
        data: {
            labels,
            datasets: [{
                label: grafico.titulo,
                data: valores,
                backgroundColor: tipo === 'line' ? 'rgba(15, 30, 60, 0.15)' : paletaCategorica,
                borderColor: tipo === 'line' ? CORES.navy : '#ffffff',
                borderWidth: tipo === 'pie' ? 2 : 1,
                tension: 0.3,
                fill: tipo === 'line',
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: tipo === 'pie', labels: { color: CORES.cinza } },
            },
            scales: tipo === 'pie' ? {} : {
                x: { ticks: { color: CORES.cinza }, grid: { display: false } },
                y: { ticks: { color: CORES.cinza }, grid: { color: '#e5e5e5' } },
            },
        },
    });
}

window.DashboardCharts = { CORES, formatarValor, renderizarGrafico };
