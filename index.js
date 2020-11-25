const express = require("express");
const socketio = require("socket.io");
const path = require("path");
const http = require("http");

const PORT = process.env.PORT || 5001;

const app = express();
const server = http.createServer(app);
const io = socketio(server, { pingTimeout: 60000 });

// for static resources requested by index.html (css, js)
app.use("/public", express.static(path.join(__dirname, "public")));
// send index.html for all requests
app.get("/*", (req, res) => {
	res.sendFile(__dirname + "/public/index.html");
});

server.listen(PORT, () => console.log(`Server has started on port ${PORT}`));

// ************ GAME LOGIC *****************

// maintain ongoing games
let games = {};

io.on("connection", (socket) => {
	socket.on("createGame", (gameId, callback) => handleCreateGame(socket, gameId, callback));
	socket.on("joinGame", (gameId, callback) => handleJoinGame(socket, gameId, callback));
    socket.on("turn", handleTurn);
    socket.on("gameEnded", handleGameEnded);
    socket.on("newGameOptIn", handleNewGameOptIn);
	socket.on("disconnect", () => handleDisconnect(socket));
});

function handleCreateGame(socket, gameId, callback) {
	if (gameId in games) {
		callback({ err: "That game already exists" });
		return;
    }
    const startingBoard = buildRandomBoard();

    games[gameId] = {
        board: startingBoard,
        playerIds: [socket.id],
        newGamePlayerIds: [],
    };
	socket.join(gameId, (err) => {
		if (err) {
			callback({ err });
			console.log(`Error: ${err}`);
		} else {
			callback({ 
                board: startingBoard,
                msg: `Waiting for opponent to join: ${gameId}`,
            });
		}
	});
}

function handleJoinGame(socket, gameId, callback) {
	if (!(gameId in games)) {
		callback({ err: "That game doesn't exist!" });
		return;
	}
	if (games[gameId].playerIds.length !== 1) {
		callback({ err: "There's no room in that game!" });
		return;
	}
    games[gameId].playerIds.push(socket.id);
    
	socket.join(gameId, (err) => {
		if (err) {
			callback({ err });
		} else {
            callback({ msg: `joined game ${gameId}`, board: games[gameId].board });

            // randomly choose who goes first
            const turnPlayerIdx = Math.random() < 0.5 ? 0 : 1;
			io.to(gameId).emit("startGame", games[gameId].playerIds[turnPlayerIdx]);
		}
    });
}

function handleDisconnect(socket) {
	const gameId = Object.keys(games).find(
		(gameId) => games[gameId].playerIds.indexOf(socket.id) > -1
	);
	if (gameId) {
		const playerIdx = games[gameId].playerIds.indexOf(socket.id);
		if (playerIdx > -1) {
			games[gameId].playerIds.splice(playerIdx, 1);
			if (!games[gameId].playerIds.length) {
				delete games[gameId];
			}
            io.to(gameId).emit("playerLeft");
		}
	}
}

function handleTurn({ gameId, socketId, color }) {
    io.to(gameId).emit("turn", { socketId, color });
}

// reset players that have opted in to another game, so they can opt in again
function handleGameEnded({ gameId }) {
    if (gameId in games) {
        games[gameId].newGamePlayerIds = [];
    }
}

function handleNewGameOptIn({ gameId, socketId }, callback) {
    if (!(gameId in games)) {
        callback({ err: "There was an error, try reloading" });
    }

    if (games[gameId].newGamePlayerIds.indexOf(socketId) < 0) {
        // flag user as opted in to play another game
        games[gameId].newGamePlayerIds.push(socketId);
        // if everyone has opted in, send new game info
        if (games[gameId].newGamePlayerIds.length === 2) {
            const board = buildRandomBoard();
			// randomly choose who goes first again
			const turnPlayerIdx = Math.random() < 0.5 ? 0 : 1;
			const turnPlayerId = games[gameId].playerIds[turnPlayerIdx];
            io.to(gameId).emit("newGame", { board, turnPlayerId });
        }
    }
}

function buildRandomBoard() {
    const colors = ["red", "green", "yellow", "blue", "purple", "black"];
    const board = [];
    for (let i = 0; i < 56; i++) {
        // adjacent cells can't match, so we have to check already assigned neighbors first
        const unusableColors = new Set();

        // check cell to the left
        if (i % 8 !== 0) {
            unusableColors.add(board[i - 1]);
        }
        // check cell above
        if (i >= 8) {
            unusableColors.add(board[i - 8]);
        }
        const usableColors = colors.filter(
            (color) => [...unusableColors].indexOf(color) < 0
        );
        board[i] = usableColors[Math.floor(Math.random() * usableColors.length)];
    }
    return board;
}
