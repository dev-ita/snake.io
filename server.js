const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const players = {};
const apples = [];
let particles = [];
const canvasWidth = 800;
const canvasHeight = 600;
const appleRadius = 5;
const particleRadius = 2;

// Servir arquivos estáticos (HTML, CSS, JS) da pasta 'public'
// app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "public")));

// Gera uma maçã aleatória
function generateApple() {
  return {
    x: Math.random() * canvasWidth,
    y: Math.random() * canvasHeight,
    id: Math.random().toString(36).substring(7), // ID único para cada maçã
  };
}

// Adiciona maçãs iniciais
for (let i = 0; i < 50; i++) {
  apples.push(generateApple());
}

// Gera uma partícula
function generateParticle(x, y, color) {
  return {
    x: x,
    y: y,
    color: color,
    lifespan: 500, // Ajuste a duração conforme necessário
  };
}

// Adiciona partículas
function handlePlayerDeath(playerId) {
  const player = players[playerId];
  if (player) {
    // Cria partículas na posição da cabeça do jogador com deslocamento aleatório
    const particlesToAdd = [];
    player.snake.forEach((segment) => {
      let particlesBySegment = 2;
      for (let i = 0; i < particlesBySegment; i++) {
        // Gera partículas por segmento
        particlesToAdd.push(
          generateParticle(
            segment.x + Math.random() * 20 - 10, // Adiciona deslocamento aleatório no eixo x
            segment.y + Math.random() * 20 - 10, // Adiciona deslocamento aleatório no eixo y
            player.color
          )
        );
      }
    });
    particles.push(...particlesToAdd);
    io.emit("playerDead", {
      id: playerId,
      particles: particlesToAdd,
    });
    delete players[playerId]; // Remove o jogador do jogo
  }
}

// Coleta de partículas por um jogador
function handleParticleCollection(player) {
  particles.forEach((particle, index) => {
    const distance = Math.hypot(
      player.snake[0].x - particle.x,
      player.snake[0].y - particle.y
    );
    if (distance < particleRadius + 5) {
      // Considerando o raio da partícula e da cobra
      player.snakeLength += 1; // Aumenta o tamanho da cobra
      player.score += 1;
      particles.splice(index, 1); // Remove a partícula coletada
    }
  });
}

// Atualiza o estado dos jogadores
function updateScores() {
  io.emit("updateScores", players);
}

// Quando um cliente se conecta
io.on("connection", (socket) => {
  console.log("Novo jogador conectado:", socket.id);

  // Inicializa o jogador
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * canvasWidth,
    y: Math.random() * canvasHeight,
    angle: 0,
    snake: [
      { x: Math.random() * canvasWidth, y: Math.random() * canvasHeight },
    ],
    snakeLength: 5,
    color: "#" + Math.floor(Math.random() * 16777215).toString(16), // Gera uma cor aleatória
    score: 0, // Inicializa a pontuação
    name: null, // Nome do jogador (inicialmente indefinido),
    speed: 2,
    boost: false,
  };

  // Envia o estado inicial do jogo (exceto jogadores)
  socket.emit("currentApples", apples);
  socket.emit("currentParticles", particles);

  // Quando o jogador define seu nome
  socket.on("setName", (name) => {
    const player = players[socket.id];
    if (player && !player.name) {
      player.name = name;
      io.emit("newPlayer", player);
      io.emit("currentPlayers", players);
      socket.emit("nameSet"); // Confirmação de que o nome foi definido
    }
  });

  // Quando o jogador se move
  socket.on("playerMovement", (data) => {
    const player = players[socket.id];
    if (player && player.name) {
      player.angle = data.angle;
      player.speed = data.speed;
    }
  });

  // Quando o jogador usa o impulso
  socket.on("playerBoost", () => {
    const player = players[socket.id];
    if (player) {
      player.boost = true;
      setTimeout(() => {
        player.boost = false; // Remove o impulso após 1 segundo
      }, 1000);
    }
  });

  // Quando o jogador se desconecta
  socket.on("disconnect", () => {
    console.log("Jogador desconectado:", socket.id);
    handlePlayerDeath(socket.id);
    updateScores();
  });
});

// Atualiza o estado do jogo em intervalos regulares
setInterval(() => {
  // Atualiza a posição de cada cobra
  for (let id in players) {
    const player = players[id];
    if (player.name) {
      // Somente atualiza jogadores que definiram um nome
      const dx = Math.cos(player.angle) * player.speed;
      const dy = Math.sin(player.angle) * player.speed;

      // Calcula nova posição da cabeça
      const head = { x: player.snake[0].x + dx, y: player.snake[0].y + dy };
      player.snake.unshift(head);

      // Mantém o tamanho da cobra
      if (player.snake.length > player.snakeLength) {
        player.snake.pop();
      }

      // Verifica colisão com maçãs
      apples.forEach((apple, index) => {
        if (
          Math.hypot(player.snake[0].x - apple.x, player.snake[0].y - apple.y) <
          appleRadius + 5
        ) {
          player.snakeLength += 1;
          player.score += 10; // Incrementa a pontuação
          apples[index] = generateApple(); // Gera nova maçã
        }
      });

      // Verifica colisão com outros jogadores
      for (let otherId in players) {
        if (id !== otherId) {
          const otherPlayer = players[otherId];
          if (
            otherPlayer.snake.some(
              (segment) =>
                Math.hypot(
                  player.snake[0].x - segment.x,
                  player.snake[0].y - segment.y
                ) < 10
            )
          ) {
            handlePlayerDeath(id);
            break;
          }
        }
      }

      // Coleta partículas
      handleParticleCollection(player);
    }
  }

  // Atualiza as partículas
  particles.forEach((particle) => {
    particle.lifespan -= 1;
  });

  // Remove partículas expiradas
  particles = particles.filter((p) => p.lifespan > 0);

  // Envia o estado do jogo para todos os clientes
  io.emit("gameState", players, apples, particles);
  updateScores();
}, 1000 / 60); // Atualiza 60 vezes por segundo

server.listen(3000, () => {
  console.log("Servidor ouvindo na porta 3000");
});
