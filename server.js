const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
// Configuración de CORS para aceptar peticiones desde GitHub Pages o Localhost
const io = new Server(server, {
    cors: {
        origin: "*", // Cambia esto por la URL de tu GitHub Pages en producción
        methods: ["GET", "POST"]
    }
});

const rooms = {};

// Baraja estándar (dos mazos para Sequence = 104 cartas)
const suits = ['♠', '♥', '♦', '♣'];
const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
function createDeck() {
    let deck = [];
    for (let i = 0; i < 2; i++) {
        for (let suit of suits) {
            for (let value of values) {
                deck.push({ suit, value });
            }
        }
    }
    return deck.sort(() => Math.random() - 0.5); // Shuffle básico
}

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    socket.on('createRoom', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                deck: createDeck(),
                turn: 0,
                started: false
            };
            socket.join(roomId);
            rooms[roomId].players.push({ id: socket.id, name: `Jugador 1`, team: 'blue', hand: [] });
            socket.emit('roomCreated', roomId);
        } else {
            socket.emit('errorMsg', 'La sala ya existe.');
        }
    });

    socket.on('joinRoom', ({ roomId, playerName }) => {
        const room = rooms[roomId];
        if (room && !room.started) {
            socket.join(roomId);
            const teams = ['blue', 'red', 'green'];
            // Asignación de equipos secuencial (ideal para 1v1, 2v2, 1v1v1)
            const teamColor = teams[room.players.length % teams.length]; 
            
            room.players.push({ 
                id: socket.id, 
                name: playerName || `Jugador ${room.players.length + 1}`, 
                team: teamColor, 
                hand: [] 
            });
            
            io.to(roomId).emit('updatePlayers', room.players);
        } else {
            socket.emit('errorMsg', 'Sala no encontrada o el juego ya empezó.');
        }
    });

    socket.on('chatMessage', ({ roomId, message, sender }) => {
        io.to(roomId).emit('message', { sender, text: message });
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players.length >= 2) {
            room.started = true;
            // Repartir cartas (ej. 7 cartas por jugador)
            const cardsPerPlayer = room.players.length <= 2 ? 7 : 5; 
            room.players.forEach(player => {
                player.hand = room.deck.splice(0, cardsPerPlayer);
                io.to(player.id).emit('dealCards', player.hand);
            });
            io.to(roomId).emit('gameStarted', room.players);
            io.to(roomId).emit('updateTurn', room.players[room.turn].id);
        }
    });

    socket.on('playCard', ({ roomId, cardIndex, boardPosition }) => {
        // Aquí agregarás la lógica de validación de Sequence (Jacks de 1 ojo, Jacks de 2 ojos, esquinas libres)
        const room = rooms[roomId];
        if (room && room.players[room.turn].id === socket.id) {
            const player = room.players[room.turn];
            const playedCard = player.hand.splice(cardIndex, 1)[0];
            
            // Repartir nueva carta
            if (room.deck.length > 0) {
                player.hand.push(room.deck.pop());
            }

            io.to(roomId).emit('cardPlayed', { 
                playerId: socket.id, 
                card: playedCard, 
                pos: boardPosition,
                team: player.team
            });
            
            io.to(player.id).emit('dealCards', player.hand); // Actualizar mano

            // Siguiente turno
            room.turn = (room.turn + 1) % room.players.length;
            io.to(roomId).emit('updateTurn', room.players[room.turn].id);
        }
    });

    socket.on('disconnect', () => {
        // Lógica para manejar desconexiones y limpiar salas vacías
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
