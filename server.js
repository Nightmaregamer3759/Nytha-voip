const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Servidor VoIP Online!");
});

const wss = new WebSocket.Server({ server });

const salas = new Map();

function enviar(ws, mensagem) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(mensagem);
    }
}

function enviarParaSala(sala, mensagem, excluir = null) {
    for (const jogador of sala.jogadores) {
        if (jogador !== excluir) {
            enviar(jogador, mensagem);
        }
    }
}

function sairDaSala(ws) {
    if (!ws.sala) return;

    const sala = salas.get(ws.sala);

    if (!sala) {
        ws.sala = null;
        return;
    }

    sala.jogadores.delete(ws);

    enviarParaSala(
        sala,
        "JOGADOR_SAIU",
        ws
    );

    if (sala.jogadores.size === 0) {
        salas.delete(ws.sala);
    }

    ws.sala = null;
}

wss.on("connection", (ws) => {

    ws.sala = null;

    enviar(ws, "CONECTADO");

    ws.on("message", (data) => {

        const mensagem = data.toString();

        const partes = mensagem.split("|");

        const comando = partes[0];

        // ==============================
        // ENTRAR NA SALA DE VOZ
        //
        // ENTRAR|NomeDaSala
        // ==============================

        if (comando === "ENTRAR") {

            const nomeSala = partes[1];

            if (!nomeSala) {
                enviar(ws, "ERRO|SALA_INVALIDA");
                return;
            }

            sairDaSala(ws);

            let sala = salas.get(nomeSala);

            if (!sala) {

                sala = {
                    jogadores: new Set()
                };

                salas.set(
                    nomeSala,
                    sala
                );
            }

            if (sala.jogadores.size >= 2) {
                enviar(ws, "ERRO|SALA_CHEIA");
                return;
            }

            sala.jogadores.add(ws);

            ws.sala = nomeSala;

            enviar(
                ws,
                `ENTROU|${nomeSala}`
            );

            enviarParaSala(
                sala,
                "JOGADOR_ENTROU",
                ws
            );
        }

        // ==============================
        // OFERTA WEBRTC
        // ==============================

        else if (comando === "OFERTA") {

            if (!ws.sala) return;

            const sala = salas.get(ws.sala);

            if (!sala) return;

            enviarParaSala(
                sala,
                mensagem,
                ws
            );
        }

        // ==============================
        // RESPOSTA WEBRTC
        // ==============================

        else if (comando === "RESPOSTA") {

            if (!ws.sala) return;

            const sala = salas.get(ws.sala);

            if (!sala) return;

            enviarParaSala(
                sala,
                mensagem,
                ws
            );
        }

        // ==============================
        // ICE CANDIDATE
        // ==============================

        else if (comando === "ICE") {

            if (!ws.sala) return;

            const sala = salas.get(ws.sala);

            if (!sala) return;

            enviarParaSala(
                sala,
                mensagem,
                ws
            );
        }

        // ==============================
        // SAIR
        // ==============================

        else if (comando === "SAIR") {

            sairDaSala(ws);

            enviar(
                ws,
                "SAIU"
            );
        }
    });

    ws.on("close", () => {
        sairDaSala(ws);
    });
});

server.listen(PORT, () => {
    console.log(
        `Servidor VoIP rodando na porta ${PORT}`
    );
});
