/* ============================================================
 * PONTE.JS — Batuta
 *
 * Reimplementa `google.script.run` sobre `fetch`, para que o Index.html
 * rode fora do Apps Script sem uma única linha alterada nas 27 chamadas
 * que ele faz ao backend.
 *
 * A migração vira UMA tabela de mapeamento auditável, em vez de 27
 * edições espalhadas onde qualquer uma pode sair errada em silêncio.
 *
 * Carregar ANTES do script do app. Ver SPEC-002.
 * ============================================================ */

(function () {
  "use strict";

  var K_URL = "batuta.url";
  var K_TOKEN = "batuta.token";

  // ── armazenamento tolerante a falha ──
  // Safari em aba privada lança ao gravar; a app não pode morrer por isso.
  function ler(k) {
    try { return localStorage.getItem(k) || ""; } catch (e) { return ""; }
  }
  function gravar(k, v) {
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }
  function apagar(k) {
    try { localStorage.removeItem(k); } catch (e) {}
  }

  var URL_API = ler(K_URL);
  var TOKEN = ler(K_TOKEN);
  var conectado = !!(URL_API && TOKEN);

  /* ============================================================
   * TABELA DE MAPEAMENTO
   * nome da função no Index.html → [ação da API, método, params(args)]
   *
   * Manter em sincronia com ROTAS_API em core/api_rotas.gs.
   * ============================================================ */
  var MAPA = {
    // ── leitura ──
    getDadosDashboard: function (a) {
      return ["dashboard", "GET", { mes: a[0] || "TODOS" }];
    },
    getTransacoesPaginadas: function (a) {
      return ["transacoes", "GET", {
        mes: a[0] || "TODOS", page: a[1] || 1, pageSize: a[2] || 50,
        busca: a[3] || "", tipo: a[4] || "", categoria: a[5] || "",
      }];
    },
    getConfigData: function () { return ["config", "GET", {}]; },
    getCategorias: function () { return ["categorias", "GET", {}]; },
    getDadosInvestimentos: function () { return ["investimentos", "GET", {}]; },
    // Nota: apiGetMaestroResumo NÃO entra aqui. O app pega as prefs do Maestro
    // pelo getConfigData(). A rota "maestro" existe na API para outros
    // consumidores (bot do Telegram, por exemplo), mas a ponte só traduz o
    // que o Index.html realmente chama — há teste garantindo isso.

    // ── escrita ──
    salvarTransacao: function (a) {
      return ["salvarTransacao", "POST", { transacao: a[0] }];
    },
    excluirTransacaoPorId: function (a) {
      return ["excluirTransacao", "POST", { id: a[0] }];
    },
    salvarTodosOrcamentos: function (a) {
      return ["salvarOrcamentos", "POST", { lista: a[0] }];
    },
    salvarMetaEconomia: function (a) {
      return ["salvarMeta", "POST", { valor: a[0] }];
    },
    salvarMaestroPrefs: function (a) {
      return ["salvarMaestro", "POST", { prefs: a[0] }];
    },
    adicionarCategoria: function (a) {
      return ["addCategoria", "POST", { tipo: a[0], nome: a[1] }];
    },
    removerCategoria: function (a) {
      return ["delCategoria", "POST", { tipo: a[0], nome: a[1] }];
    },
    salvarLiquidezCategoria: function (a) {
      return ["salvarLiquidez", "POST", { nome: a[0], liquidez: a[1] }];
    },
    concluirOnboarding: function () {
      return ["concluirOnboarding", "POST", {}];
    },
    testarEmailIndividual: function (a) {
      return ["testarEmail", "POST", { tipo: a[0] }];
    },
    testarEmailMaestro: function () {
      return ["testarEmailGeral", "POST", {}];
    },
    salvarUrlApp: function () {
      // O app informa o PRÓPRIO endereço, não o /exec — assim os e-mails do
      // Maestro passam a linkar para a PWA, que é onde o usuário realmente está.
      return ["salvarUrlApp", "POST", { url: location.origin + location.pathname }];
    },
  };

  /* ============================================================
   * TRANSPORTE
   * ============================================================ */

  function chamar(acao, metodo, params) {
    if (metodo === "GET") {
      var q = new URLSearchParams({ acao: acao, token: TOKEN });
      for (var k in params) {
        if (params[k] !== undefined && params[k] !== null) q.set(k, params[k]);
      }
      return fetch(URL_API + "?" + q.toString(), {
        method: "GET",
        redirect: "follow",
      }).then(digerir);
    }

    // text/plain é obrigatório: qualquer outro Content-Type dispara um
    // preflight OPTIONS, que o Apps Script não responde — e a requisição
    // morre no navegador sem nunca sair. Ver SPEC-002, seção 4.
    return fetch(URL_API, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ acao: acao, token: TOKEN, dados: params }),
    }).then(digerir);
  }

  function digerir(resposta) {
    return resposta.text().then(function (texto) {
      var env;
      try {
        env = JSON.parse(texto);
      } catch (e) {
        // Resposta não-JSON quase sempre significa que o Google devolveu uma
        // página de login ou de erro — ou seja, a implantação não está como
        // "Qualquer pessoa".
        throw new Error(
          "O servidor não respondeu em JSON. Verifique se o app foi " +
            "implantado com acesso 'Qualquer pessoa'.",
        );
      }

      if (env && env.ok) return env.dados;

      var codigo = (env && env.erro) || "ERRO_DESCONHECIDO";
      if (codigo === "TOKEN_INVALIDO" || codigo === "TOKEN_NAO_CONFIGURADO") {
        mostrarConexao(env.msg || "Código de acesso inválido.");
      }
      var err = new Error((env && env.msg) || codigo);
      err.codigo = codigo;
      throw err;
    });
  }

  /* ============================================================
   * A PONTE
   * Reproduz a interface encadeada do google.script.run:
   *   google.script.run.withSuccessHandler(f).withFailureHandler(g).acao(args)
   * ============================================================ */

  function criarPonte(aoSucesso, aoErro) {
    var alvo = {
      withSuccessHandler: function (f) { return criarPonte(f, aoErro); },
      withFailureHandler: function (f) { return criarPonte(aoSucesso, f); },
      withUserObject: function () { return criarPonte(aoSucesso, aoErro); },
    };

    Object.keys(MAPA).forEach(function (nome) {
      alvo[nome] = function () {
        // Sem conexão, não fazemos nada: a tela de conexão está por cima e o
        // app fica no estado de carregamento por trás, sem erro na tela.
        if (!conectado) return;

        var m = MAPA[nome]([].slice.call(arguments));
        chamar(m[0], m[1], m[2])
          .then(function (dados) {
            if (aoSucesso) aoSucesso(dados);
          })
          .catch(function (err) {
            if (aoErro) aoErro(err);
            else console.error("[ponte] " + nome + ": " + err.message);
          });
      };
    });

    return alvo;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = criarPonte(null, null);

  // O app original chama google.script.host.close() em alguns pontos.
  window.google.script.host = window.google.script.host || {
    close: function () {},
    setHeight: function () {},
    setWidth: function () {},
  };

  /* ============================================================
   * TELA DE CONEXÃO
   * ============================================================ */

  function mostrarConexao(aviso) {
    if (document.getElementById("batuta-conexao")) {
      if (aviso) document.getElementById("batuta-aviso").textContent = aviso;
      return;
    }

    var el = document.createElement("div");
    el.id = "batuta-conexao";
    el.innerHTML =
      '<style>' +
      '#batuta-conexao{position:fixed;inset:0;z-index:99999;background:#131829;color:#E7E9F0;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow-y:auto;' +
      'padding:calc(env(safe-area-inset-top) + 30px) 22px calc(env(safe-area-inset-bottom) + 30px);}' +
      '#batuta-conexao .cx{max-width:440px;margin:0 auto;}' +
      '#batuta-conexao .mc{display:flex;align-items:center;gap:12px;margin-bottom:26px;}' +
      '#batuta-conexao .mc img{width:44px;height:44px;border-radius:11px;}' +
      '#batuta-conexao .mc b{font-size:19px;}' +
      '#batuta-conexao h2{font-size:17px;margin:0 0 8px;}' +
      '#batuta-conexao p{font-size:14px;line-height:1.55;color:#8A91A6;margin:0 0 18px;}' +
      '#batuta-conexao label{display:block;font-size:12px;color:#8A91A6;margin:14px 0 7px;}' +
      '#batuta-conexao input{width:100%;box-sizing:border-box;padding:13px 14px;font-size:15px;' +
      'border-radius:10px;border:1px solid #2A3145;background:#1B2133;color:#E7E9F0;}' +
      '#batuta-conexao input:focus{outline:2px solid #D9A94F;outline-offset:1px;}' +
      '#batuta-conexao button{width:100%;margin-top:18px;padding:14px;font-size:15px;font-weight:600;' +
      'border:0;border-radius:10px;background:#D9A94F;color:#131829;cursor:pointer;}' +
      '#batuta-conexao .av{background:#2E1A1D;color:#E06B76;border:1px solid #8A3038;border-radius:10px;' +
      'padding:12px 14px;font-size:13px;line-height:1.5;margin-bottom:18px;}' +
      '#batuta-conexao .av:empty{display:none;}' +
      '#batuta-conexao .aj{font-size:12px;color:#6B7186;line-height:1.6;margin-top:22px;' +
      'border-top:1px solid #2A3145;padding-top:16px;}' +
      '</style>' +
      '<div class="cx">' +
      '  <div class="mc"><img src="./icones/icone-192.png" alt=""><b>Batuta</b></div>' +
      '  <div class="av" id="batuta-aviso"></div>' +
      '  <h2>Conectar à sua planilha</h2>' +
      '  <p>Só na primeira vez. Os dois valores ficam guardados neste aparelho.</p>' +
      '  <label for="bt-url">1. Endereço do app (termina em /exec)</label>' +
      '  <input id="bt-url" type="url" inputmode="url" autocomplete="off" spellcheck="false"' +
      '         placeholder="https://script.google.com/macros/s/.../exec">' +
      '  <label for="bt-token">2. Código de acesso (32 caracteres)</label>' +
      '  <input id="bt-token" type="text" autocomplete="off" spellcheck="false"' +
      '         autocapitalize="off" placeholder="cole aqui o código">' +
      '  <button id="bt-conectar">Conectar</button>' +
      '  <div class="aj">Os dois valores estão na sua planilha, juntos, em' +
      '     <b>🎼 Batuta → 📲 Conectar o celular</b>.' +
      '     Se o menu não aparecer, recarregue a planilha e espere alguns segundos.</div>' +
      '</div>';

    document.body.appendChild(el);

    var iUrl = document.getElementById("bt-url");
    var iTok = document.getElementById("bt-token");
    iUrl.value = URL_API;
    iTok.value = TOKEN;
    if (aviso) document.getElementById("batuta-aviso").textContent = aviso;

    document.getElementById("bt-conectar").onclick = function () {
      var u = iUrl.value.trim();
      var t = iTok.value.trim();
      var av = document.getElementById("batuta-aviso");

      if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(u)) {
        av.textContent = "O endereço precisa começar com https://script.google.com/ e terminar em /exec";
        return;
      }
      if (t.length < 16) {
        av.textContent = "O código tem 32 caracteres. Confira se copiou inteiro.";
        return;
      }

      if (!gravar(K_URL, u) || !gravar(K_TOKEN, t)) {
        av.textContent = "Não foi possível guardar neste navegador. Saia da navegação privada e tente de novo.";
        return;
      }
      location.reload();
    };
  }

  // Exposto para a tela de Configurações poder desconectar.
  window.batutaDesconectar = function () {
    apagar(K_URL);
    apagar(K_TOKEN);
    location.reload();
  };
  window.batutaConectado = function () { return conectado; };

  if (!conectado) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { mostrarConexao(""); });
    } else {
      mostrarConexao("");
    }
  }
})();
