const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

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
app.use(express.static("public"));

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

// Atualiza o estado do jogo
function updateGameState() {
  for (let id in players) {
    const player = players[id];
    if (player.name) {
      const dx = Math.cos(player.angle) * player.speed;
      const dy = Math.sin(player.angle) * player.speed;

      const head = { x: player.snake[0].x + dx, y: player.snake[0].y + dy };
      player.snake.unshift(head);

      if (player.snake.length > player.snakeLength) {
        player.snake.pop();
      }

      apples.forEach((apple, index) => {
        if (
          Math.hypot(player.snake[0].x - apple.x, player.snake[0].y - apple.y) <
          appleRadius + 5
        ) {
          player.snakeLength += 1;
          player.score += 10;
          apples[index] = generateApple();
        }
      });

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
            // Cria partículas para o jogador morto
            const particlesToAdd = player.snake.map((segment) =>
              generateParticle(segment.x, segment.y, "red")
            );
            io.emit("playerDead", { id: id, particles: particlesToAdd });
            handlePlayerDeath(id);
            break;
          }
        }
      }

      handleParticleCollection(player);
    }
  }

  particles.forEach((particle) => {
    particle.lifespan -= 1;
  });

  particles = particles.filter((p) => p.lifespan > 0);

  io.emit("gameState", players, apples, particles);
  updateScores();
}

// Lida com a coleta de partículas
function handleParticleCollection(player) {
  particles.forEach((particle) => {
    if (
      Math.hypot(
        player.snake[0].x - particle.x,
        player.snake[0].y - particle.y
      ) < 10
    ) {
      // Adiciona a pontuação ao jogador
      player.score += 5;
      // Remove a partícula coletada
      particles = particles.filter((p) => p !== particle);
    }
  });
}

// Lida com a morte do jogador
function handlePlayerDeath(id) {
  const player = players[id];
  delete players[id];
  io.emit("playerDisconnected", id);
  io.emit("updateScores", players);
}

// Atualiza a pontuação dos jogadores
function updateScores() {
  io.emit("updateScores", players);
}

io.on("connection", (socket) => {
  console.log("New player connected: " + socket.id);

  // Adiciona o novo jogador
  players[socket.id] = {
    id: socket.id,
    snake: [{ x: canvasWidth / 2, y: canvasHeight / 2 }],
    angle: 0,
    speed: 2,
    snakeLength: 5,
    score: 0,
    name: "",
  };

  socket.emit("currentPlayers", players);
  socket.emit("currentApples", apples);
  socket.emit("currentParticles", particles);

  socket.on("setName", (name) => {
    players[socket.id].name = name;
    io.emit("newPlayer", players[socket.id]);
    updateScores();
  });

  socket.on("playerMovement", (data) => {
    const player = players[socket.id];
    if (player) {
      player.angle = data.angle;
      player.speed = data.speed;
    }
  });

  socket.on("playerBoost", () => {
    const player = players[socket.id];
    if (player) {
      player.boost = !player.boost;
    }
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected: " + socket.id);
    handlePlayerDeath(socket.id);
  });
});

setInterval(updateGameState, 1000 / 60); // Atualiza o estado do jogo 60 vezes por segundo

server.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
