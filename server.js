const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {

    // CORS para TurboWarp/navegador
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    // ==========================================
    // TESTE DA ROTA DE IA
    // POST /ia
    // { "mensagem": "Olá" }
    // ==========================================

    if (
        req.method === "POST" &&
        req.url === "/ia"
    ) {

        console.log("[/ia] Requisição recebida");

        let corpo = "";

        req.on("data", parte => {

            corpo += parte;

            // Evita requisições gigantes.
            if (corpo.length > 100000) {
                req.destroy();
            }
        });

        req.on("end", async () => {

            try {

                const dados =
                    JSON.parse(corpo || "{}");

                const mensagem =
                    String(
                        dados.mensagem || ""
                    ).trim();

                if (!mensagem) {

                    res.writeHead(
                        400,
                        {
                            "Content-Type":
                                "application/json; charset=utf-8"
                        }
                    );

                    res.end(
                        JSON.stringify({
                            erro:
                                "MENSAGEM_VAZIA"
                        })
                    );

                    return;
                }

                console.log(
                    "[IA TESTE]",
                    mensagem
                );

                const apiKey = process.env.GEMINI_API_KEY;
                if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

                const respostaGemini = await fetch(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-goog-api-key": apiKey
                        },
                        body: JSON.stringify({
                                contents: [
                                    {
                                        parts: [
                                            {
                                                text: mensagem
                                            }
                                        ]
                                    }
                                ]
                            })
                    }
                );

                const dadosGemini = await respostaGemini.json();

                if (!respostaGemini.ok) {
                    console.error("Erro Gemini:", dadosGemini);
                    throw new Error(
                        dadosGemini?.error?.message ||
                        ("Gemini HTTP " + respostaGemini.status)
                    );
                }

                const respostaIA =
                    dadosGemini?.candidates?.[0]?.content?.parts
                        ?.map(parte => parte.text || "").join("").trim()
                    || "A IA não retornou uma resposta.";

                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            "application/json; charset=utf-8"
                    }
                );

                res.end(
                    JSON.stringify({
                        resposta:
                            respostaIA
                    })
                );

            }

            catch (erro) {

                console.error(
                    "Erro na rota /ia:",
                    erro
                );

                // Para diagnóstico, devolvemos HTTP 200 para o
                // TurboWarp conseguir mostrar o erro real no reporter.
                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            "application/json; charset=utf-8"
                    }
                );

                res.end(
                    JSON.stringify({
                        resposta:
                            "ERRO GEMINI: " +
                            String(
                                erro && erro.message
                                    ? erro.message
                                    : erro
                            )
                    })
                );
            }
        });

        return;
    }


    // Página principal do servidor
    if (
        req.method === "GET" &&
        req.url === "/"
    ) {

        res.writeHead(
            200,
            {
                "Content-Type":
                    "text/plain; charset=utf-8"
            }
        );

        res.end(
            "Servidor VoIP + IA Online!"
        );

        return;
    }


    res.writeHead(
        404,
        {
            "Content-Type":
                "application/json; charset=utf-8"
        }
    );

    res.end(
        JSON.stringify({
            erro: "NAO_ENCONTRADO"
        })
    );
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
