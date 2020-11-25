$(document).ready(function () {
    const socket = io({ transports: ["websocket"], upgrade: false });
    bindSocketEvents(socket);
    
    const content = $("#content");
    const boardEl = $("#game-board");
    const msgBox = $("#msg-box");
    const resetGame = $("#play-again");
    const yourScore = $("#your-score");
    const theirScore = $("#their-score");
    const modal = $("#modal");
    const modalTrigger = $("#modal-trigger");
    const onboarding = $("#onboarding");

    let board = [];
    let yourCells;
    let yourColor;
    let theirCells;
    let theirColor;
    let isYourTurn;
    let seenOnboarding = false;

    bindColorClickEvents();
    bindModalClickEvents();
    resetGame.on("click", handleResetGame)

    let gameId = window.location.pathname.split("/")[1];
	if (gameId) {
		socket.emit("joinGame", gameId, handleGameJoined);
	} else {
		gameId = `${Math.floor(Math.random() * 100000000)}`.slice(0, 7);
        socket.emit("createGame", `${gameId}`, (res) => handleGameCreated(res, gameId));
        history.pushState({}, null, gameId);
    }

    // ********** SOCKET EVENTS *************

    function bindSocketEvents(socket) {
        socket.on("playerLeft", () => alert("Your opponent disconnected :("));
        socket.on("startGame", handleStartGame);
        socket.on("turn", handleTurn);
        socket.on("newGame", handleNewGame);
    }
    
    function handleGameCreated({ board: startingBoard, msg, err }, gameId) {
        if (err) {
            alert(err);
        }
        if (msg) {
            console.log(msg);
        }
        const gameLink = `${window.location.origin}/${gameId}`;
		updateMsgBox(
            `<div>
                Invite a friend:
                </br>
                <input value=${gameLink} onclick="this.focus();this.select()" class="invite-input" readonly="readonly" />
            </div>`
        );
        renderBoard(startingBoard);
    }

    function handleGameJoined({ board: startingBoard, msg, err }) {
        if (err) {
            alert(err);
        }
        if (msg) {
            console.log(msg);
        }
        renderBoard(startingBoard);
    }

    function handleTurn({ socketId, color }) {
        if (socketId !== socket.id) {
            handleColorChange(color, false);
        }
    }

    // tell server that user has opted in to another game
    function handleResetGame() {
        resetGame.hide();
		socket.emit("newGameOptIn", { gameId, socketId: socket.id }, ({ err }) => {
            if (err) {
                alert(err);
            }
        });
        updateMsgBox("Waiting on opponent...");
	}

    function handleNewGame({ board: startingBoard, turnPlayerId }) {
        renderBoard(startingBoard);
        handleStartGame(turnPlayerId);
    }

    // ********** DOM & GAME LOGIC ************

    function handleStartGame(turnPlayerId) {
        isYourTurn = turnPlayerId === socket.id;
        
		// cells you've captured, starting with either bottom left or top right
        yourCells = isYourTurn ? [48] : [7];
        yourColor = board[yourCells[0]];
        // cells they've captured, starting on opposite side of board
        theirCells = isYourTurn ? [7] : [48];
        theirColor = board[theirCells[0]];

        updateMsgBox(isYourTurn ? "Your turn" : "Waiting on your opponent");
        updateScores();

        // rotate non-host's board 180deg so user always starts from the bottom left
        boardEl.removeClass("rotated").toggleClass("rotated", !isYourTurn);
        // show tip to indicate where to start
        onboarding.addClass("visible");

        toggleColorButtonsDisabled([yourColor, theirColor], !isYourTurn);
	}

    function bindColorClickEvents() {
        $(".color-option").on("click", function() {
            handleColorChange($(this).data("color"), true);
        });
    }

    function bindModalClickEvents() {
        modalTrigger.on("click", () => toggleModalOpen(true));
        modal.on("click", (e) => {
            const clickedEl = $(e.target);
            if (!clickedEl.closest("#modal-content").length
                || clickedEl.closest("#close").length) {
                toggleModalOpen(false);
            }
        });
        document.addEventListener("keydown", e => {
            if (modal.hasClass("open") && e.keyCode === 27) {
                toggleModalOpen(false);
            }
        });
    }

    function renderBoard(startingBoard) {
        $(".cell").remove();
        board = startingBoard;
        if (board && board.length) {
            board.forEach((color, i) =>
                boardEl.append(`<div class="cell ${color}" data-cell="${i}"></div>`)
            );
		}
    }
    
    function handleColorChange(color, yourTurn) {
        // buttons have pointer-events: none for this scenario, but can still
        // call this function with enter key, so double check it's the right user's turn
        if (yourTurn && !isYourTurn) {
            return;
        }
        if (!seenOnboarding && yourTurn) {
            onboarding.removeClass("visible");
            seenOnboarding = true;
        }
        const playerCells = yourTurn ? yourCells : theirCells;
        const adjacents = new Set();
        playerCells.forEach(cell => {
            // left
            if (cell % 8 !== 0) {
                adjacents.add(cell - 1);
            }
            // top
            if (cell >= 8) {
                adjacents.add(cell - 8);
            }
            // right
            if (cell % 8 !== 7) {
                adjacents.add(cell + 1);
            }
            //bottom
            if (cell <= 47) {
                adjacents.add(cell + 8);
            }
        });

        // get adjacents that match clicked color
        const colorAdjacents = [...adjacents].filter(cell => board[cell] === color);
        const allColorsClass = "red green yellow blue purple black active";
        // re-color cells to clicked color and update global board
        [...playerCells, ...colorAdjacents].forEach((cell) => {
            // clone cell and replace original so animation can run again
            const selector = `.cell[data-cell="${cell}"]`;
            const cellEl = $(selector);
            const clonedCell = cellEl.clone(true);
            cellEl.before(clonedCell);
            $(selector + ":last").remove();
            clonedCell.removeClass(allColorsClass).addClass(`${color} active`);
			board[cell] = color;
		});

        // add newly acquired cells
        if (yourTurn) {
            yourCells = [ ...playerCells, ...colorAdjacents ];
            yourColor = color;
        } else {
            theirCells = [ ...playerCells, ...colorAdjacents ];
            theirColor = color;
        }

        if (yourTurn) {
            socket.emit("turn", {
                gameId: gameId,
                socketId: socket.id,
                color,
            });
    
            endTurn();
        } else {
            startTurn();
        }

        updateScores();
        checkForGameOver();
    }

    function endTurn() {
        isYourTurn = false;
        toggleColorButtonsDisabled([], true);
        updateMsgBox("Waiting on your opponent");
    }

    function startTurn() {
        isYourTurn = true;
        toggleColorButtonsDisabled([yourColor, theirColor], false);
        updateMsgBox("Your turn");
    }

    function toggleColorButtonsDisabled(colors, disableAll) {
        $(".color-option")
            .removeClass("disabled")
            .filter(function() {
                return disableAll || colors.indexOf($(this).data("color")) > -1;
            })
            .addClass("disabled");
    }
    
    function toggleModalOpen(open) {
        content.toggleClass("modal-open", open);
        modal.toggleClass("open", open);
    }

    function updateMsgBox(msg) {
        msgBox.html(msg);
    }

    function updateScores() {
        yourScore.html(yourCells.length);
        theirScore.html(theirCells.length);
    }

    function checkForGameOver() {
        if (yourCells.length + theirCells.length >= 56) {
            let resultMsg;
            if (yourCells.length === theirCells.length) {
                resultMsg = "You tied! Pretty wild."
            } else if (yourCells.length > theirCells.length) {
                resultMsg = "🎉🎉 You won!!!  🎉🎉";
            } else {
                resultMsg = "You lost &nbsp; :(";
            }

            updateMsgBox(resultMsg);
            toggleColorButtonsDisabled([], true);
            resetGame.show();
        }
    }
});