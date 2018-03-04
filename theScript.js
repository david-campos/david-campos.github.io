(function() {
/**
 * @param {String} color
 * @param {Jugador} jug
 * @constructor
 */
function Bola(color, jug) {
    this.v = {x: 0, y: 0};
    this.vR = Math.PI; //Velocidad angular en rad/s (solo efectiva dentro de orbita)
    this.vRstop = 0; // Para el efecto stop
    this.vRPrevia = this.vR;
    this.maxV = 0.15; // Velocidad angular máxima
    this.incVr = Math.PI / 6; //Aumento de velocidad rad/(s^2)

    this.ang = 0; //Angulo girado.
    this.x = 0; // Posición en x
    this.y = 0; // Posición en y
    this.anterior_pos = {x:0, y:0};
    this.r = RADIO_BOLAS;

    /** @type {Planeta} */
    this.planeta = null; // Planeta asociado
    /** @type {Planeta} */
    this.planetaAnt = null; // Planeta previo (para evitar que se agarre antes de salir)
    /** @type {Planeta} */
    this.planetaRechazado = null; // Planeta del que salió (para el planet lover)

    /** @type {?Agujero} */
    this.noTragar = null; // La protege de ser tragada para cuando sale de un agujero negro (gracias al asteroide)
    this.gravedad = false; // Para el asteroide gravedad propia
    this.planetLover = 0; // Asteroide planet lover

    this.viva = true;
    this.maxvidas = 4;
    this.vidas = this.maxvidas;
    this.color = color;
    this.jugador = jug;
    if(this.jugador) {
        this.jugador.asignarBola(this);
    }
}

/**
 * Echa a la bola de la órbita en la que se encuentra
 */
Bola.prototype.salirOrb = function () {
    if (!this.planeta) return;
    // v será la velocidad lineal
    var v = this.vR * this.planeta.rg;
    // intercambiamos las componentes y negamos una para obtener u perpendicular al radio
    var u = {x:  this.planeta.y-this.y, y: this.x - this.planeta.x};
    // Hacemos u unitario
    var mu = moduloVector(u.x, u.y);
    u.x = u.x / mu;
    u.y = u.y / mu;
    this.v.x = u.x * v;
    this.v.y = u.y * v;
    this.planetaAnt = this.planeta;
    this.planetaRechazado = this.planeta;
    this.planeta.bolas.splice(this.planeta.bolas.indexOf(this), 1);
    this.planeta = null;
    reproducir(sonidos.cambio);
};

/**
 * Daña la bola y puede que termine el juego
 * @param {Game} juego Juego en el que está la bola
 * @param {String} mensajeEnCasoDeMuerte un mensaje en caso de que este daño produzca la muerte
 * @param {boolean} [mortal] si es true, la bola muere independientemente de sus vidas restantes
 */
Bola.prototype.damage = function (juego, mensajeEnCasoDeMuerte, mortal) {
    // Si no hay al menos dos bolas o el modo es "Centro", no muere nadie humano
    if (juego.bolas.length < 2 || (juego.modo === MODOS.CENTRO && this.jugador)) return;

    // Asteroide salvador
    if (this.salvado) {
        this.salvado = false;
        return;
    }

    // Restamos una vida
    this.vidas--;
    var c = Math.floor((this.vidas - 0.3) / (this.maxvidas - 0.3) * 255);
    this.color = "rgb(" + c + "," + c + "," + c + ")";

    // Continuar viviendo?
    if (!mortal && this.vidas > 0) {
        if (this.jugador)
            Log.nuevaNota(this.vidas + " li"+(this.vidas>1?"ves":"fe")+" left", this.jugador);
        else
            Log.nuevaNota(this.vidas + " li"+(this.vidas>1?"ves":"fe")+" left");
        this.planetaAnt = null;
        return;
    }

    // Ha muerto
    this.viva = false;
    sonidos.muerte.currentTime = 0;
    sonidos.muerte.play();

    //Si tiene Jugador lo administramos para buscarle otra a ser posible
    if (this.jugador) {
        Log.nuevaNota(mensajeEnCasoDeMuerte, this.jugador);
        this.jugador.bolas--;
        this.jugador.muertes++;
        this.jugador.ultimaMuerte = Date.now() - juego.inicioPartida;

        for (var i in juego.bolas) {
            if (!juego.bolas[i].jugador) {
                juego.bolas[i].jugador = this.jugador;
                this.jugador.bolas++;
                break;
            }
        }
        //Adiós Bola
        juego.bolas.splice(juego.bolas.indexOf(this), 1);
    } else {
        //Adiós Bola
        juego.bolas.splice(juego.bolas.indexOf(this), 1);
        return; //La muerte de una Bola sin Jugador no puede causar el final.
    }

    // Comprobamos si se acabó el juego
    var viven = 0;
    var superviviente = null;
    for (i in juego.jugadores) {
        if (juego.jugadores[i].bolas > 0) {
            superviviente = juego.jugadores[i];
            viven++;
            if (viven > 1)
                return;
        }
    }

    //Si llega hasta aquí, la partida ha acabado...
    juego.finalizar(superviviente);
};

Bola.prototype.updateEnOrbita = function(elapsedSeconds) {
    if(juego && juego.stopEffect && juego.stopper !== this) {
        this.vRstop = (this.vR===0?this.vRstop:this.vR);
        this.vR = 0;
        return;
    } else {
        if(this.vRstop !== 0) {
            this.vR = this.vRstop;
            this.vRstop = 0;
        }
    }

    var r = Math.random();

    // Para el cálculo de colisiones
    this.vRPrevia = this.vR;

    if(Math.abs(this.vR * this.planeta.rg) < VEL_LIN_MIN) {
        this.vR += (this.vR > 0?1:-1) * r * this.incVr * elapsedSeconds;
    }

    // Avanzamos el ángulo
    this.ang += (this.vR * elapsedSeconds);

    // Corrección de vuelta entera
    if(Math.abs(this.ang) > 2 * Math.PI)
        this.ang -= 2 * Math.PI * signo(this.ang);

    this.x = this.planeta.x + this.planeta.rg * Math.cos(this.ang);
    this.y = this.planeta.y + this.planeta.rg * Math.sin(this.ang);

    //Sumar / restar velocidad
    // var vant = Math.abs(this.vR * this.planeta.rg);
    var vLineal = Math.abs(this.vR / this.planeta.rg);
    if(vLineal  < this.maxV)
        this.vR += r * this.incVr * elapsedSeconds * signo(this.vR);
    if(vLineal > this.maxV/2)
        this.vR -= r * this.incVr * elapsedSeconds * signo(this.vR) * 0.9;
    // Corrección cuando la velocidad es exageradamente alta
    if(vLineal > this.maxV*1.5)
        this.vR *= 0.8;

    // Control secundario
    if(this.jugador && keysDown[this.jugador.secondControlId]) {
        this.vR *= 0.95;
    }

    /*if(Math.abs(pl.vR * pl.Planeta.rg) -  vant > 0) //Aumento la v
        pl.color = "#00FF00";
    else if(Math.abs(pl.vR * pl.Planeta.rg) -  vant < 0) //Aumento la v
        pl.color = "#FF0000";
    else
        pl.color = "#FFFFFF";*/
};// Jugadores (tienen un color y un id de control)
function Jugador(color, controlId, secondControlId) {
    this.bolas = 0;
    this.muertes = 0;
    this.tiempo = 0; // tiempo en el centro
    this.color = color;
    this.controlId = controlId;
    this.secondControlId = secondControlId;
    this.ultimaMuerte = 0;
    this.noRepetirSonidos = {};
    this.id = Jugador.ultId++;
}

Jugador.ultId = 1;
Jugador.prototype.asignarBola = function () {
    this.bolas++;
};

/**
 * @type {[[String, Number]]}
 */
var ast_tipos = [["Invincible", 20],
    ["Speed up x 2", 30],
    ["Speed down", 40],
    ["Out of the orbit!", 150],
    ["Invisible", 180],
    ["Useless asteroid", 210],
    ["Rebound!", 150],
    ["Lucky", 30],
    ["Own gravity", 30],
    ["Speed up", 180],
    ["Lifesaver", 210],
    ["Transport", 180],
    ["Reproductive", 20],
    ["Changing roles", 10],
    ["Stop", 5],
    ["Planet lover", 40],
    ["A Present", 25],
    ["Blind", 10],
    ["Speed down x 2", 30],
    ["Another chance", 20]];
var ast_prob_t = 0;
for (var i in ast_tipos) {
    ast_prob_t += parseInt(ast_tipos[i][1]);
    ast_tipos[i][1] = ast_prob_t;
}

function Asteroide(x, y) {
    this.x = x;
    this.y = y;
    var r = Math.random();
    this.duracion = 2000 + (r * 8000);

    var t = Math.floor(r * ast_prob_t);
    for (var i in ast_tipos) {
        if (parseInt(ast_tipos[i][1]) >= t) {
            this.tipo = parseInt(i);
            break;
        }
    }
}

Asteroide.prototype.hacerEfecto = function (bola) {
    var buenosTipos = [0, 1, 4, 8, 9, 10, 11];
    if (bola.fortuna) {
        this.tipo = buenosTipos[Math.floor(Math.random() * buenosTipos.length)];
    }
    // No darle el asteroide stop a las bolas sin jugador
    // sería un coñazo tener a todos los jugadores parados
    if (this.tipo === 14 && !bola.jugador) {
        this.tipo = 3;
    }
    switch (this.tipo) {
        case 0:
            bola.invencible = true;
            bola.invencibleTime = this.duracion;
            break;
        case 1:
            bola.vR *= 1.75;
            bola.v.x *= 1.75;
            bola.v.y *= 1.75;
            break;
        case 2:
            bola.vR *= 0.5;
            bola.v.x *= 0.5;
            bola.v.y *= 0.5;
            break;
        case 3:
            bola.salirOrb();
            break;
        case 4:
            bola.invisible = true;
            bola.invisibleTime = this.duracion;
            break;
        case 5:
            break;
        case 6:
            bola.vR *= -1;
            bola.v.x *= -1;
            bola.v.y *= -1;
            break;
        case 7:
            bola.fortuna = true;
            bola.fortunaTime = this.duracion * 10;
            break;
        case 8:
            bola.gravedad = true;
            bola.gravedadTime = this.duracion * 5;
            break;
        case 9:
            bola.vR *= 1.5;
            bola.v.x *= 1.5;
            bola.v.y *= 1.5;
            break;
        case 10:
            bola.salvado = true;
            break;
        case 11:
            bola.transportado = true;
            break;
        case 12: //Reproductive
            if (juego) {
                juego.asteroides.push(globf_generarAsteroide(juego));
                juego.asteroides.push(globf_generarAsteroide(juego));
                juego.asteroides.push(globf_generarAsteroide(juego));
            }
            break;
        case 13: // Changing roles
            if (juego) {
                for (var i in juego.bolas) {
                    var jugador = juego.bolas[i].jugador;
                    i = parseInt(i);
                    var otraBola = Math.floor(Math.random() * (juego.bolas.length - i)) + i;
                    juego.bolas[i].jugador = juego.bolas[otraBola].jugador;
                    juego.bolas[otraBola].jugador = jugador;
                }
            }
            reproducir(sonidos.dados);
            break;
        case 14: // Stop!
            if (juego) {
                juego.stopEffect = Date.now() + this.duracion/2;
                juego.stopper = bola;
            }
            break;
        case 15: // Planet lover
            bola.planetLover = this.duracion + 1000;
            break;
        case 16: // A Present
            if(juego) {
                juego.generarBola(bola.jugador, []);
            }
            break;
        case 17: // Blind
            if(juego) {
                juego.blindGame = this.duracion;
            }
            break;
        case 18: // Speed down x 2
            bola.vR *= 0.25;
            bola.v.x *= 0.25;
            bola.v.y *= 0.25;
            break;
        case 19: // Another chance
            if(juego) {
                juego.generarBola(null, []);
            }
            break;
        default:
            console.log("Asteroide tipo [", this.tipo, "] DESCONOCIDO.", this);
    }
    if (bola.jugador)
        Log.nuevaNota(ast_tipos[this.tipo][0], bola.jugador);
    else
        Log.nuevaNota(ast_tipos[this.tipo][0]);
};

function Planeta(x, y, r, rg, centro) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.centro = centro;
    if (this.centro) {
        this.mayor_t = 0;
        this.mayor_t_j = null;
    }
    this.bolas = [];
    var ran = Math.random();
    this.n_imagen = Math.floor(ran * PICS_PLANETAS_N);
    this.ang = ran * 10;
    this.vel = (0.001 + ran * 0.009) * Math.pow(-1, Math.floor(ran * 10));
    this.rotarEn = 0;

    //Si la imagen no se cargó para otro Planeta, se carga.
    this.cargarImagen();
    this.renderizado = null;

    this.rg = rg;
    this.nodisponible = 0; // Tiempo que está no disponible (se actualiza durante el juego)
    this.radioVariable = !centro && ran * 1000 < 100;
    if (this.radioVariable) {
        this.rr = rg;
        this.rv = 1.0;
        this.crece = false;
    }
    if (this.r < 35 && Math.random() < PROB_INQUIETO) {
        this.inquieto = true;
        this.movingV = 10 + Math.random() * 20; // Muy lentitos
        this.dir = {x: Math.random() * 2 - 1, y: Math.random() * 2 - 1};
        var mod = moduloVector(this.dir.x, this.dir.y);
        this.dir.x /= mod;
        this.dir.y /= mod;
    }
}

Planeta.prototype.update = function (elapsedSeconds) {
    if (this.radioVariable) {
        if (this.crece)
            this.rv += 0.001;
        else
            this.rv -= 0.001;
        if (this.rv <= 0.75) {
            this.rv = 0.75;
            this.crece = true;
        }
        if (this.rv >= 1) {
            this.rv = 1;
            this.crece = false;
        }
        this.rg = this.rr * this.rv;
    }

    if (this.inquieto) {
        this.dir.x += Math.random() * 0.1 - 0.05;
        this.dir.y += Math.random() * 0.1 - 0.05;
        var mod = moduloVector(this.dir.x, this.dir.y);
        // Velocidad
        this.dir.x *= this.movingV * elapsedSeconds / mod;
        this.dir.y *= this.movingV * elapsedSeconds / mod;

        var valido = true;
        var rg = (this.radioVariable ? this.rr : this.rg);
        var margen = rg + 2 * RADIO_BOLAS;
        var nuevaY = this.y + this.dir.y;
        var nuevaX = this.x + this.dir.x;
        if (nuevaX > margen && nuevaX < MAP.w - margen && nuevaY > margen && nuevaY < MAP.h - margen) {
            for (var i in juego.planetas) {
                var otroP = juego.planetas[i];

                if (otroP === this)
                    continue;

                var otroRg = (otroP.radioVariable ? otroP.rr : otroP.rg);
                if (moduloVector(otroP.x - nuevaX, otroP.y - nuevaY) < otroRg + margen) {
                    valido = false;
                    break;
                }
            }
            if (valido) {
                this.x = nuevaX;
                this.y = nuevaY;
            } else {
                if (Math.random() > 0.5) {
                    this.dir.x *= -1;
                } else {
                    this.dir.y *= -1;
                }
            }
        }
    }

    this.bolasUpdate(elapsedSeconds);
};

/**
 * Actualización física de las bolas que orbitan el planeta
 * @param {Number} elapsedSeconds segundos pasados desde el último frame
 */
Planeta.prototype.bolasUpdate = function (elapsedSeconds) {
    var bolasConJugador = [];

    for (var i in this.bolas) {
        var bola = this.bolas[i];
        bola.updateEnOrbita(elapsedSeconds);

        // Si esto es un centro y la bola tiene jugador,
        // lo contamos
        if (this.centro && bola.jugador)
            bolasConJugador.push(bola);
        bola = this.bolas[i];

        // Salir de la órbita si el jugador quiere y la velocidad lineal
        // es suficiente
        if (bola.jugador && keysDown[bola.jugador.controlId]) {
            var lin = Math.abs(bola.vR * this.rg);
            if (lin > VEL_LIN_MIN) {
                bola.salirOrb();
            } else if (!bola.jugador.noRepetirSonidos.cinta) {
                bola.jugador.noRepetirSonidos.cinta = true;
                reproducir(sonidos.cinta);
            }
            continue;
        }

        // Si es invisible no colisiona
        if (bola.invisible)
            continue;

        // Colisiones
        // Recorremos todas las anteriores bolas del planeta,
        // nótese que todas han sido actualizadas y tienen su vRPrevio correcto
        for (var j = i; j >= 0; j--) {
            var otra = this.bolas[j];
            // No colisionan si la otra es invisible o llevan la misma velocidad
            // (es muy muy difícil que lleven la misma velocidad, dado que las variaciones son aleatorias)
            if (otra.invisible || otra.vRPrevia === bola.vRPrevia) continue;

            // Dividimos en cuatro puntos el recorrido y comprobamos la colisión en cada uno
            var rs = bola.r + otra.r;
            var col = false;
            for (var k = 0; !col && k < 4; k++) {
                col = moduloVector(
                    bola.x - k / 4 * bola.vRPrevia - otra.x + k / 4 * otra.vRPrevia,
                    bola.y - k / 4 * bola.vRPrevia - otra.y + k / 4 * otra.vRPrevia) < rs;
            }

            if (col) {
                // Si estamos en stop
                if (juego && juego.stopEffect) {
                    if (juego.stopper === bola) {
                        otra.vR = bola.vR;
                        otra.salirOrb();
                    } else if (juego.stopper === otra) {
                        bola.vR = otra.vR;
                        bola.salirOrb();
                    }
                } else {
                    if (bola.vR * otra.vR <= 0) {
                        //Choque frontal
                        var pvR = Math.abs(bola.vR);
                        var bvR = Math.abs(otra.vR);
                        bola.vR *= -1;
                        otra.vR *= -1;

                        if (pvR <= bvR && !bola.invencible) {
                            //bola más lento o iguales
                            bola.vR *= 1.35;
                            otra.vR *= 0.85;
                            bola.salirOrb();
                        }
                        if (pvR >= bvR && !otra.invencible) {
                            //bola más rápido o iguales
                            bola.vR *= 0.85;
                            otra.vR *= 1.35;
                            otra.salirOrb();
                        }
                    } else {
                        //Choque por detrás
                        if (Math.abs(bola.vR) < Math.abs(otra.vR)) {
                            bola.vR = otra.vR;
                            otra.vR = bola.vR * 0.85;
                            if (!bola.invencible) bola.salirOrb();
                        } else {
                            otra.vR = bola.vR;
                            bola.vR = otra.vR * 0.85;
                            if (!otra.invencible) otra.salirOrb();
                        }
                    }
                }
                reproducir(sonidos.pong);
                if (bola.invencible)
                    otra.salirOrb();
                if (otra.invencible)
                    bola.salirOrb();
                break;
            }
        }
    }

    // Solo cuenta para el centro cuando una bola es la única
    // de algún jugador en el planeta.
    if (this.centro && bolasConJugador.length === 1) {
        var jug = bolasConJugador[0].jugador;
        if (jug && this.centro) {
            if (this.ultimo) this.ultimo.ultimo = false;
            this.ultimo = jug;
            jug.ultimo = true;

            jug.tiempo += elapsedSeconds;
            if (jug.tiempo > this.mayor_t) {
                this.mayor_t = jug.tiempo;
                this.mayor_t_j = jug;
            }
        }
    }
};

/**
 * Si no se cargó la imagen para otro planeta, la cargamos ahora
 */
Planeta.prototype.cargarImagen = function () {
    var self = this;
    self.imagen = new Image();
    self.imagen.src = "img/planeta_" + this.n_imagen + ".png";
    self.imagen.onload = function () {
        self.renderizado = document.createElement("canvas");
        self.renderizado.width = 2*self.r;
        self.renderizado.height = 2*self.r;
        self.ctx = self.renderizado.getContext("2d");
        self.ctx.save();
        self.rotar();
    };
};

Planeta.prototype.rotar = function() {
    if(this.renderizado) {
        this.ctx.clearRect(0, 0, this.r*2, this.r*2);
        this.ctx.save();
        this.ctx.translate(this.r, this.r);
        this.ctx.rotate(this.ang);
        this.ang = (this.ang + this.vel)%(2*Math.PI);
        this.ctx.drawImage(this.imagen,
            -this.r,
            -this.r,
            this.r*2,
            this.r*2);
        this.ctx.restore();
    }
    this.rotarEn = Date.now() + 100;
};

function Agujero(x, y, r, c, a) {
    this.x = x;
    this.y = y;
    this.r = r >= c ? r : c; //Radio (en el que absorbe, no puede ser menor que c)
    this.c = c; //Centro (en el que pierdes)
    this.a = a; //Aceleración que imprime hacia él (pixels/segundo^2)
    this.ang = 0; //Angulo para la rotacion (grafica)
}/**
 * @param {[Jugador]} jugadores
 * @param {String} modo
 * @param {int} maxPlanetas
 * @param {int} bolasExtra
 * @param {Number} tiempo
 * @param {int} maxAgujeros
 * @param {Boolean} agujerosInofensivos
 * @param {int} [bolasXjugador]
 * @constructor
 */
function Game(jugadores, modo, maxPlanetas, bolasExtra, tiempo, maxAgujeros, agujerosInofensivos, bolasXjugador) {
    // Configuración del juego
    this.modo = (modo !== undefined && globf_esModo(modo)) ? modo : MODOS.CLASICO;
    this.maxPlanetas = (maxPlanetas > 0) ? maxPlanetas : jugadores.length + bolasExtra;
    this.numBolasExtra = bolasExtra;
    this.bolasXjugador = (bolasXjugador && bolasXjugador > 0) ? bolasXjugador : 1;
    this.maxAgujeros = maxAgujeros > 0 ? maxAgujeros : 0;
    this.duracion = tiempo;
    this.agujerosInofensivos = agujerosInofensivos;
    /**
     * @type {Jugador[]}
     */
    this.jugadores = jugadores;

    // Objetos de juego
    /**
     * @type {[Bola]}
     */
    this.bolas = [];

    /**
     * @type {[Agujero]}
     */
    this.agujeros = [];
    /**
     * @type {[Planeta]}
     */
    this.planetas = [];
    /**
     * @type {[Planeta]}
     */
    this.planetasND = [];
    /**
     * @type {[Planeta]}
     */
    this.planetasRV = [];
    /**
     * @type {[Asteroide]}
     */
    this.asteroides = [];

    // Funcionamiento
    this.actualizarParteFija=true;
    this.mapaGenerado = false;
    this.bolasGeneradas = false;
    this.iniciado = false;
    this.pausado = false;
    this.finalizado = false;
    this.apagado = false;
    this.inicioPartida = 0; // Guarda el momento de inicio de la partida
    this.then = 0; // Para calcular el tiempo entre frames
    this.stopEffect = 0; // Para el asteroide Stop!
    this.stopper = null;
    this.blindGame = 0; // Para el asteroide blind
}

/**
 * Inicia el juego
 */
Game.prototype.start = function () {
    this.generarMapa();
    this.generarBolas();
    generarPreRenderizados(juego);
    this.iniciado = true;
    this.finalizado = false;
    this.then = Date.now();
    this.inicioPartida = this.then;
    // Iniciamos el juego
    this.mainLoop();
};

var measures = ["renderizado",
    "update",
    "physicsUpdate",
    "noDisponible",
    "planetas",
    "bolas"
];
var valores={};
for(var m in measures) {
    valores[measures[m]] = [];
}

/**
 * Bucle principal del juego
 */
Game.prototype.mainLoop = function () {
    var now = Date.now();
    var delta = now - this.then;

    if (delta === 0) {
        delta = 1;
        console.log("delta=0\n");
    } else {
        glob_fps = Math.round(0.6 * glob_fps + 400 / delta);
        glob_fps_min = (glob_fps < glob_fps_min ? glob_fps : glob_fps_min);
    }

    if (!this.pausado) {
        render(this);
        if (!this.finalizado) {
            this.physicsUpdate(delta/1000);
            this.noDisponiblesUpdate();

            //Fin de partida en modo no clásico
            if (this.duracion > 0 &&
                now - this.inicioPartida > this.duracion * 60000) {
                this.finalizar(null);
            }
            // Stop effect
            if (now > this.stopEffect) {
                this.stopEffect = 0;
                this.stopper = null;
            }
            // Blind game
            if(this.blindGame > 0) {
                this.blindGame -= delta;
            }
            // Eliminación de notas antiguas
            for (var i in Log.notas) {
                if (Log.notas[i].t < now) {
                    Log.notas.splice(parseInt(i), 1);
                } else {
                    break;
                }
            }
        }
    }

    this.then = now;
    // Request to do this again ASAP
    var self = this;
    if (!this.apagado)
        requestAnimationFrame(function () {
            self.mainLoop()
        });
};

/**
 * Actualiza la física de las bolas
 */
Game.prototype.physicsUpdate = function (elapsedSeconds) {
    // Actualizamos las colisiones de las que están orbitando,
    // planeta a planeta
    for (var i in this.planetas) {
        var planeta = this.planetas[i];
        planeta.update(elapsedSeconds);
    }

    // Actualizamos las colisiones de las bolas
    // que no se encuentran en ningún planeta
    for (i in this.bolas) {
        var bola = this.bolas[i];

        this.actualizacionAsteroides(bola, elapsedSeconds);

        if (bola.planeta || !bola.viva) continue;

        bola.anterior_pos = {x: bola.x, y: bola.y};
        this.bolaLibreUpdate(bola, elapsedSeconds);
        if (!bola.viva) {
            // Si se la ha tragado un agujero negro
            continue;
        }

        this.bolaColisionBordes(bola, elapsedSeconds);
        if (!bola.viva) {
            // Si ha caído fuera del campo
            continue;
        }

        this.orbitarPlanetaQuizas(bola);

        if (bola.planetaAnt) {
            if (moduloVector(bola.x - bola.planetaAnt.x, bola.y - bola.planetaAnt.y) > bola.planetaAnt.rg + RADIO_BOLAS)
                bola.planetaAnt = null; // Ya no cuenta el planeta anterior (puede volver a él)
        }
    }
};

/**
 * Comprueba si la bola ha colisionado con los bordes
 * y realiza las acciones correspondientes
 * @param {Bola} bola
 * @param {Number} elapsedSeconds segundos desde el último frame
 */
Game.prototype.bolaColisionBordes = function (bola, elapsedSeconds) {
    if (bola.x < 0 || bola.x > MAP.w) {
        bola.v.x *= -1;
        bola.x += bola.v.x * elapsedSeconds; // Previene que se atasque allí
        bola.planetaAnt = null; // Ya no cuenta el planeta anterior (puede volver a él)
        reproducir(sonidos.pong2);
        bola.damage(this, "Dead (out of bounds)");
    }
    if (bola.y < 0 || bola.y > MAP.h) {
        bola.v.y *= -1;
        bola.y += bola.v.y * elapsedSeconds; // Previene el atasco ahí
        bola.planetaAnt = null; // Ya no cuenta el planeta anterior (puede volver a él)
        reproducir(sonidos.pong2);
        bola.damage(this, "Dead (out of bounds)");
    }
};

/**
 * Comprueba si la bola está lo suficientemente cerca de un planeta como para orbitarlo,
 * si lo está y tiene que orbitarlo, la ancla al planeta.
 * @param {Bola} bola
 */
Game.prototype.orbitarPlanetaQuizas = function (bola) {
    var planet = this.planetaParaOrbitar(bola);
    //Cuando toca por primera vez una órbita
    if ((!bola.jugador || !keysDown[bola.jugador.controlId]) && planet && !bola.planeta) {
        bola.planeta = planet;
        planet.bolas.push(bola);
        // Vector u que va del planeta a la bola
        var ux = bola.x - planet.x;
        var uy = bola.y - planet.y;
        // El angulo es el agumento del vector u
        bola.ang = Math.atan2(uy, ux);
        // La velocidad angular tendrá como valor la velocidad lineal entre el radio
        bola.vR = Math.sqrt(bola.v.x * bola.v.x + bola.v.y * bola.v.y) / planet.rg;
        // El sigo será el de la componente en la tercera dimensión
        // de la multiplicación vectorial de u y la velocidad
        if (ux * bola.v.y - uy * bola.v.x < 0) bola.vR *= -1;
        //Sonido de entrar
        reproducir(sonidos.entrada);
    }
};

/**
 * Realiza algunas actualizaciones de los asteroides: recogida, actualización de habilidades, generación
 */
Game.prototype.actualizacionAsteroides = function (bola, elapsedSeconds) {
    for (var i in this.asteroides) {
        var as = this.asteroides[i];
        if (moduloVector(bola.x - as.x, bola.y - as.y) < bola.r + 5) {
            as.hacerEfecto(bola);
            this.asteroides.splice(parseInt(i), 1);
        }
    }
    if (bola.invencible) {
        bola.invencibleTime -= elapsedSeconds * 1000;
        if (bola.invencibleTime < 0)
            bola.invencible = false;
    }
    if (bola.invisible) {
        bola.invisibleTime -= elapsedSeconds * 1000;
        if (bola.invisibleTime < 0)
            bola.invisible = false;
    }
    if (bola.fortuna) {
        bola.fortunaTime -= elapsedSeconds * 1000;
        if (bola.fortunaTime < 0)
            bola.fortuna = false;
    }
    if (bola.gravedad) {
        bola.gravedadTime -= elapsedSeconds * 1000;
        if (bola.gravedadTime < 0)
            bola.gravedad = false;
    }
    if(bola.planetLover) {
        bola.planetLover -= elapsedSeconds * 1000;
        if(bola.planetLover < 0)
            bola.planetLover = 0;
    }

    if (this.asteroides.length < ASTEROIDES_MAX && Math.random() * 1000 < PROB_ASTEROIDE)
        this.asteroides.push(globf_generarAsteroide(this));
};

/**
 * Busca algún planeta cuya órbita esté en contacto con la última trayectoria
 * entre frames de la bola. Si no hay ninguno devuelve null.
 * @param {Bola} bola la bola que se ha desplazado
 */
Game.prototype.planetaParaOrbitar = function (bola) {
    for (var i in this.planetas) {
        var p = this.planetas[i];
        if ((p.nodisponible && !bola.gravedad) || bola.planetaAnt === p)
            continue;

        //Vamos a obtener la menor distancia del segmento (pl.anterior_pos pl.pos) al centro del Planeta
        var d = menorDistanciaPS(bola.anterior_pos, bola, p);
        if (d <= p.rg + RADIO_BOLAS && d >= p.rg - RADIO_BOLAS)
            return p;
    }
    return null;
};

/**
 * Actualiza una bola que ande libre por el espacio (sin planeta asociado)
 * @param bola
 * @param elapsedSeconds
 */
Game.prototype.bolaLibreUpdate = function (bola, elapsedSeconds) {
    if(bola.planetLover) {
        var min = 0;
        var minDist = Infinity;
        for(var p in this.planetas) {
            if(this.planetas[p] !== bola.planetaRechazado) {
                var distancia = moduloVector(bola.x - this.planetas[p].x, bola.y - this.planetas[p].y);
                if (distancia < minDist) {
                    min = p;
                    minDist = distancia;
                }
            }
        }
        // Nos atraemos hacia él
        var v = moduloVector(bola.v.x, bola.v.y);
        bola.v.x += elapsedSeconds*v*(this.planetas[min].x - bola.x)/minDist;
        bola.v.y += elapsedSeconds*v*(this.planetas[min].y - bola.y)/minDist;
    }

    bola.x += bola.v.x * elapsedSeconds;
    bola.y += bola.v.y * elapsedSeconds;

    if (!bola.noTragar) {
        // Comparamos su distancia con todos los agujeros negros existentes
        for (var i in this.agujeros) {
            var ag = this.agujeros[i];
            var d = menorDistanciaPS(bola.anterior_pos, bola, ag);
            // ag.r te atrae, ag.c te traga
            if (d <= ag.r) {
                if (!this.agujerosInofensivos && d <= ag.c) {
                    if (bola.transportado) {
                        // Si tiene el teletransporte la teletransportamos
                        bola.transportado = false;
                        var j;
                        do {
                            j = Math.floor(Math.random() * this.agujeros.length);
                        } while (this.agujeros.length > 1 && j === i);
                        bola.x = this.agujeros[j].x;
                        bola.y = this.agujeros[j].y;
                        bola.noTragar = this.agujeros[j];
                        bola.planetaAnt = null; // Ya no cuenta el planeta anterior (puede volver a él)
                    } else {
                        // Si no lo tiene, la matamos
                        bola.damage(this, "Dead (black hole)", true);
                        return; // Siguiente bola, esta c'est fini.
                    }
                } else {
                    v = {'x': (ag.x - bola.x), 'y': (ag.y - bola.y)};
                    v.x *= elapsedSeconds * ag.a / moduloVector(v.x, v.y);
                    v.y *= elapsedSeconds * ag.a / moduloVector(v.x, v.y);
                    bola.v.x += v.x;
                    bola.v.y += v.y;
                }
                // Ya coincidió con uno, no seguir buscando
                break;
            }
        }
    } else {
        ag = bola.noTragar;
        d = menorDistanciaPS(bola.anterior_pos, bola, ag);
        if (d > ag.r) {
            bola.noTragar = null;
        }
    }
};

/**
 * Actualiza los planetas que habían sido desactivados (no disponibles), una vez por frame.
 * También tiene cierta probabilidad de desactivar una nueva órbita de forma aleatoria.
 */
Game.prototype.noDisponiblesUpdate = function () {
    if (Math.random() * 1000 < PROB_DESACTIVAR) {
        this.desactivarOrbitaAleatoria();
    }

    for (var i in this.planetasND) {
        this.planetasND[i].nodisponible -= 1; //Volverá a estar disponible tarde o temprano
        if (this.planetasND[i].nodisponible < 1) {
            this.planetasND[i].nodisponible = 0;
            this.planetasND.splice(parseInt(i), 0); // Lo eliminamos, ya está disponible de nuevo
        }
    }
};

/**
 * Desactiva la órbita de un planeta cualquiera que esté activo
 */
Game.prototype.desactivarOrbitaAleatoria = function () {
    var i = Math.floor(Math.random() * this.planetas.length);
    if (!this.planetas[i].nodisponible && !this.planetas[i].centro) {
        this.planetasND.push(this.planetas[i]);
        this.planetas[i].nodisponible = 500;
    }
};

/**
 * Finaliza el juego, según el modo de juego el resultado será distinto
 * @param {Jugador} superviviente el jugador que ha sobrevivido, si sólo ha sido uno
 */
Game.prototype.finalizar = function (superviviente) {
    Log.clear();
    switch (this.modo) {
        case MODOS.CLASICO:
            if (superviviente) {
                Log.nuevaNota("Winner: Player " + superviviente.id, superviviente);
                break;
            }
        // Si no, esto es como el modo instinto
        // No break
        case MODOS.INSTINTO:
            var menor = 0;
            var empate = true;
            for (var i = 0; i < this.jugadores.length; i++) {
                var jug = this.jugadores[i];
                var mins = Math.floor(jug.ultimaMuerte / 60000);
                var secs = Math.floor((jug.ultimaMuerte - mins * 60000) / 1000);
                var mils = Math.floor((jug.ultimaMuerte - mins * 60000 - secs * 1000));
                if (mils < 100) mils = "0" + mils.toString();
                if (mils < 10) mils = "00" + mils.toString();

                Log.nuevaNota(
                    "Player " + (jug.id) + ": " +
                    jug.muertes + " deaths. Last one (" + mins + "' " + secs + "\" " + mils + ")", jug);
                if (empate && jug.muertes !== 0)
                    empate = false;
                if (jug.muertes < this.jugadores[menor].muertes ||
                    (jug.muertes === this.jugadores[menor].muertes &&
                        jug.ultimaMuerte > this.jugadores[menor].ultimaMuerte ))
                    menor = i;
            }
            if (!empate)
                Log.nuevaNota("Winner: Player " + this.jugadores[menor].id, this.jugadores[menor]);
            else
                Log.nuevaNota("Draw!");
            break;
        case 2:
            var mayor = 0;
            for (i = 0; i < this.jugadores.length; i++) {
                jug = this.jugadores[i];
                var nota = "Player " + (jug.id) + ": " + Math.round(jug.tiempo * 100) / 100 + " seconds.";
                if (jug.ultimo)
                    nota += " (Last one)";
                Log.nuevaNota(nota, this.jugadores[i]);
                if (jug.tiempo > this.jugadores[mayor].tiempo ||
                    (jug.tiempo === this.jugadores[mayor].tiempo && jug.ultimo ))
                    mayor = i;
            }
            Log.nuevaNota("Winner: Player " + this.jugadores[mayor].id, this.jugadores[mayor]);
            break;
    }
    var self = this;
    self.finalizado = true;
    reproducir(sonidos.claxon);
    sonidos.fondo.pause();
    reproducir(sonidos.finalizado);
    glob_overscreen.innerHTML = document.getElementById("restartScreen").innerHTML;
    var buttons = glob_overscreen.getElementsByTagName("a");
    buttons[0].onclick = restart;
    buttons[1].onclick = mainMenu;
};

/**
 * Genera el mapa de juego, se llama automáticamente al iniciar el juego
 */
Game.prototype.generarMapa = function () {
    if (this.mapaGenerado) return; // No generar dos veces
    this.mapaGenerado = true;

    // En el modo centro hay un Planeta central extra
    if (this.modo === MODOS.CENTRO) {
        this.planetas.push(
            new Planeta(MAP.w / 2, MAP.h / 2,
                RADIO_PLANETA_CENTRO, RADIO_PLANETA_CENTRO * 2, true));
    }

    //Generar planetas y agujeros
    for (var i = 0; i < this.maxPlanetas; i++) {
        var nuevoPlaneta = globf_generarPlanetaRandom(
            RADIO_PLANETAS_MIN, RADIO_PLANETAS_MAX, this);
        if (!nuevoPlaneta)
            break;
        this.planetas.push(nuevoPlaneta);
        if (nuevoPlaneta.radioVariable) {
            this.planetasRV.push(nuevoPlaneta);
        }
    }

    for (i = 0; i < this.maxAgujeros; i++) {
        var nuevoAgujero = globf_generarAgujeroRandom(
            CENTRO_AGUJERO_NEGRO, RADIO_AGUJERO_MIN, RADIO_AGUJERO_MAX, this);
        if (!nuevoAgujero)
            break;
        this.agujeros.push(nuevoAgujero);
    }
};

/**
 * Genera las bolas del juego para poder iniciarlo
 */
Game.prototype.generarBolas = function () {
    if (this.bolasGeneradas) return; // No generar dos veces
    this.bolasGeneradas = true;

    // Hacemos una copia de la lista de planetas, eliminamos el central
    var planetasDisponibles = this.planetas.slice(0);
    if (this.modo === MODOS.CENTRO) {
        for (var i in planetasDisponibles)
            if (planetasDisponibles.hasOwnProperty(i) && planetasDisponibles[i].centro) {
                planetasDisponibles.splice(parseInt(i), 1);
                break;
            }
    }

    // Generamos bolas de los jugadores
    var jugador;
    for (var idxJugador in this.jugadores) {
        if (this.jugadores.hasOwnProperty(idxJugador)) {
            jugador = this.jugadores[idxJugador];
            for (i = 0; i < this.bolasXjugador; i++) {
                this.generarBola(jugador, planetasDisponibles);
            }
        }
    }

    // Generamos las bolas extra
    for (i = 0; i < this.numBolasExtra; i++) {
        this.generarBola(null, planetasDisponibles);
    }
};

/**
 * Genera una única bola y la asigna a un planeta y al Jugador indicado
 * @param {Jugador} jugador Jugador al que asignar la bola, puede ser null si se desea que sea libre
 * @param {Array} planetasDisponibles Lista de planetas todavía disponibles
 */
Game.prototype.generarBola = function (jugador, planetasDisponibles) {
    var nuevaBola = new Bola("white", jugador);

    // Si hay planetas disponibles elegimos el siguiente disponible,
    // si no lo hay, escogemos uno aleatorio
    var pI;
    if (planetasDisponibles.length > 0) {
        pI = Math.floor(Math.random() * planetasDisponibles.length);
        nuevaBola.planeta = planetasDisponibles[pI];
        planetasDisponibles.splice(pI, 1);
    } else {
        pI = Math.floor(Math.random() * this.planetas.length);
        nuevaBola.planeta = this.planetas[pI];
    }
    nuevaBola.planeta.bolas.push(nuevaBola);

    // Velocidad y angulo
    var sig = Math.pow(-1, Math.round(Math.random())); //Para el signo
    nuevaBola.vR = sig * (3 * Math.PI / 4 + Math.PI / 2 * Math.random());
    nuevaBola.vRPrevia = nuevaBola.vR;
    nuevaBola.ang = Math.random() * 10;

    // La guardamos
    this.bolas.push(nuevaBola);
};

/**
 * Lo llama el input para avisar de que el jugador para el keyCode indicado
 * puede repetir ya los sonidos
 * @param keyCode
 */
Game.prototype.puedeRepetirSonidos = function (keyCode) {
    for (var i in this.jugadores) {
        if (this.jugadores[i].secondControlId === keyCode
            || this.jugadores[i].controlId === keyCode) {
            this.jugadores[i].noRepetirSonidos = {};
        }
    }
};

Game.prototype.apagar = function () {
    this.apagado = true;
};//Generacion nivel
var globf_generarPlanetaRandom = function (rmin, rmax, juego) {
    var vale, max;
    var x, y, r, rg;

    max = Date.now() + 1000; //1 segundo para generar de máximo
    do {
        r = (Math.random() * 10000) % (rmax - rmin) + rmin;
        rg = r * 2.5;

        vale = true;
        x = (Math.random() * 10000) % (MAP.w - 2 * (rg + RADIO_BOLAS)) + rg + RADIO_BOLAS;
        y = (Math.random() * 10000) % (MAP.h - 2 * (rg + RADIO_BOLAS)) + rg + RADIO_BOLAS;

        for (var i in juego.planetas) {
            var otroP = juego.planetas[i];
            if (moduloVector(otroP.x - x, otroP.y - y) < otroP.rg + rg + 2 * RADIO_BOLAS) {
                vale = false;
                break;
            }
        }
    } while (!vale && Date.now() < max);

    if (!vale) return null;
    return new Planeta(x, y, r, rg);
};
var globf_generarAgujeroRandom = function (c, rmin, rmax, juego) {
    var vale, max;
    var x, y, r;

    vale = false;

    max = Date.now() + 1000; //1 segundo para generar de máximo
    do {
        vale = true;
        r = Math.round(Math.random() * (rmax - rmin)) + rmin;

        x = Math.round(Math.random() * (MAP.w - 4 * r)) + r;
        y = Math.round(Math.random() * (MAP.h - 4 * r)) + r;

        for (var i in juego.planetas) {
            var otroP = juego.planetas[i];
            if (moduloVector(otroP.x - x, otroP.y - y) < otroP.rg + r + 2 * RADIO_BOLAS) {
                vale = false;
                break;
            }
        }
        if (vale)
            for (i in juego.agujeros) {
                var otroA = juego.agujeros[i];
                if (moduloVector(otroA.x - x, otroA.y - y) < otroA.r + r + 2 * RADIO_BOLAS) {
                    vale = false;
                    break;
                }
            }
    } while (!vale && Date.now() < max);

    if (!vale) return null;

    var a = Math.random() * (r / rmax) * 1500 + 500;
    return new Agujero(x, y, r, c, a);
};

//Generacion ingame
var globf_generarAsteroide = function (juego) {
    var p = Math.floor(Math.random() * juego.planetas.length);
    // Primero los que no tienen bolas, gracias
    if (juego.planetas[p].bolas.length > 0) {
        var pAlt = (p + 1) % juego.planetas.length;
        while (juego.planetas[pAlt].bolas.length > 0 && pAlt !== p) {
            pAlt = (pAlt + 1) % juego.planetas.length;
        }
        p = pAlt;
    }
    var ang = Math.floor(Math.random() * 2.5 * Math.PI);
    return new Asteroide(
        juego.planetas[p].x + juego.planetas[p].rg * Math.cos(ang),
        juego.planetas[p].y + juego.planetas[p].rg * Math.sin(ang));
};// CONFIG
const MODOS = {CLASICO: "Classic", INSTINTO: "Instinct", CENTRO: "Center"}; // Nombres de los modos de juego
/** @type {number} Radio de las bolas de juego*/
const RADIO_BOLAS = 10;
/** @type {number} Radio mínimo de los planetas generados */
const RADIO_PLANETAS_MIN = 30;
/** @type {number} Radio máximo de los planetas generados */
const RADIO_PLANETAS_MAX = 50;
/** @type {number} Radio del planeta central del modo centro */
const RADIO_PLANETA_CENTRO = 70;
/** @type {number} Radio del centro de los agujeros negros */
const CENTRO_AGUJERO_NEGRO = 10;
/** @type {number} Radio mínimo del campo gravitatorio de los agujeros negros */
const RADIO_AGUJERO_MIN = 50;
/** @type {number} Radio máximo del campo gravitatorio de los agujeros negros */
const RADIO_AGUJERO_MAX = 70;
/** @type {number} Velocidad lineal mínima a alcanzar para poder salir de órbita voluntariamente */
const VEL_LIN_MIN = 200;
/** @type {int} Número máximo de asteroides generados aleatoriamente simultáneos en un juego */
const ASTEROIDES_MAX = 20;

// PROBS
/** @type {number} Probabilidad (entre mil) para cada frame de generar un asteroide*/
const PROB_ASTEROIDE = 0.08;
/** @type {number} Probabilidad (entre mil) para cada frame de desactivar una órbita*/
const PROB_DESACTIVAR = 1;
/** @type {number} Probabilidad para cada planeta pequeño de ser un planeta inquieto*/
const PROB_INQUIETO = 0.004;


// LEGACY
// var coloreF = ["#0000b2", "#990000", "#009900", "#999900", "#009999", "#990099", "#444444", "#FF8000", "#FF7777", "#77FF77"];
// var controles = [32,13,81,226,106,220,68,71,74,76];
// var controlesNombre = ["Espacio", "Enter", "Tecla Q", "Tecla >", "Asterisco(*)", "Tecla º", "Tecla D", "Tecla G", "Tecla J", "Tecla L"];

// DISPLAY
const RENDERIZADO_LENTO_TIME = 166;
const PICS_PLANETAS_N = 17;
var glob_plt_imgs=[];
const MIN_W = 800;
const MIN_H = 600;
const MAP = {h:974, w:1920};
MAP.ar = MAP.w / MAP.h;
var glob_escala = {w: 1, h: 1, update: true};
var glob_debugMode=false;
var glob_fps = 60;
var glob_fps_min = Infinity;

// CANVAS AND GAME
var canvas = null;
var secondCanvas = null;
var ctx = null;
var scdCtx = null;
var juego = null;

function globf_esModo(modo) {
    for(var m in MODOS) {
        if(MODOS.hasOwnProperty(m) && MODOS[m] === modo) {
            return true;
        }
    }
    return false;
}// Keyboard
var keysDown = {};
var fullScreen = false;

addEventListener("keydown", function (e) {
	keysDown[e.keyCode] = true;

	if(e.keyCode === 77) {
        // Tecla M = muteBtn
        toggleMute();
    } else if(e.keyCode === 82) {
	    if(juego && juego.iniciado &&
            !juego.pausado && !juego.apagado) {
	        restart();
        }
    } else if(e.keyCode === 70) {
	    // Tecla F = fullscreen
        if(!fullScreen) {
            requestFullscreen(document.body);
            fullScreen = true;
        } else {
            exitFullscreen();
            fullScreen = false;
        }
    } else if(e.keyCode === 27) {
	   // Esc
	    if(fullScreen) exitFullscreen();
    } else if(e.keyCode === 76) {
	    // L
        glob_debugMode = !glob_debugMode;
    } else if(e.keyCode === 116 || e.keyCode === 122) {
	    // F5, F11
        return true;
    }

	if(!juego || (juego.finalizado || juego.pausado || !juego.iniciado)) return true;
	var evt = e ? e:window.event;
	if (evt.preventDefault) evt.preventDefault();
	evt.returnValue = false;
	return false;
}, false);

addEventListener("keyup", function (e) {
	delete keysDown[e.keyCode];
	if(juego) {
	    juego.puedeRepetirSonidos(e.keyCode);
    }
}, false);

var requestFullscreen = function (ele) {
    if (ele.requestFullscreen) {
        ele.requestFullscreen();
    } else if (ele.webkitRequestFullscreen) {
        ele.webkitRequestFullscreen();
    } else if (ele.mozRequestFullScreen) {
        ele.mozRequestFullScreen();
    } else if (ele.msRequestFullscreen) {
        ele.msRequestFullscreen();
    } else {
        console.log('Fullscreen API is not supported.');
    }
};

var exitFullscreen = function () {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    } else {
        console.log('Fullscreen API is not supported.');
    }
};var Log = {
    notas: [],
    /**
     * Posta una nueva nota para mostrar
     * @param {String} mensaje el mensaje de la nota
     * @param {Jugador} [jugador] el jugador al que va dirigida
     */
    nuevaNota: function(mensaje, jugador) {
        var miNota = {};
        miNota.mensaje = mensaje;
        miNota.t = Date.now() + 5000;
        miNota.color = jugador ? jugador.color : "gray";
        this.notas.push(miNota);
    },
    clear: function() {
        this.notas.splice(0, this.notas.length);
    }
};requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame || window.mozRequestAnimationFrame;

var glob_overscreen = null;

window.onload = function() {
    imgAgujero.ready = false;
    imgAgujero.src = "img/Agujero.png";
    imgAgujero.onload = function() {
        this.ready = true;
    }
    iconos_asteroides.invencible.src = "img/ico_escudo.png";
    iconos_asteroides.invisible.src = "img/ico_ojo.png";
    iconos_asteroides.fortuna.src = "img/ico_trebol.png";
    iconos_asteroides.gravedad.src = "img/ico_ancla.png";
    iconos_asteroides.salvador.src = "img/ico_corazon.png";
    iconos_asteroides.transporte.src = "img/ico_rayo.png";
    iconos_asteroides.planetLover.src = "img/ico_gravedad.png";
    canvas = document.getElementById("mainframe");
    ctx = canvas.getContext("2d");
    secondCanvas = document.getElementById("backframe");
    scdCtx = secondCanvas.getContext("2d");
    glob_overscreen = document.getElementById("overscreen");
    // Iniciar menú
    initMenu();
    // Ajustar canvas
    redimensionar(window.innerWidth, window.innerHeight);
};

// Función llamada cuando la resolución
// es demasiado baja
function resolucionInsuficiente(activo) {
    if(!juego) return;

    if(juego.iniciado && !juego.finalizado && !juego.pausado && activo) {
        glob_overscreen.innerHTML =
            "Too low resolution, the minimum resolution is " + MIN_W + "x" + MIN_H + ".";
        glob_overscreen.style.backgroundColor = "black";
    }
    if(juego.iniciado && !juego.finalizado && juego.pausado && !activo) {
        glob_overscreen.innerHTML = "";
        glob_overscreen.style.backgroundColor = "";
    }
    juego.pausado = activo;
}

/**
 * Muestra e inicia el juego
 * @param {[Jugador]} jugadores jugadores para el juego
 * @param {String} modo modo de juego, ver MODOS
 * @param {Number} tiempo minutos de juego (-1 para infinito)
 * @param {int} maxAgujeros número máximo de agujeros
 * @param {boolean} agujerosInofensivos si true, los agujeros no matarán al jugador
 */
function iniciar(jugadores, modo, tiempo, maxAgujeros, agujerosInofensivos) {
    glob_overscreen.style.backgroundColor = "black";
    document.getElementById("menu").style.display = "none";
    document.getElementById("juego").style.display = "block";
    document.documentElement.style.animation = "unset";
    var maxPlanetas = 20 + Math.round(Math.random() * 5) - maxAgujeros;
    var bolasExtra = Math.round(Math.random() * 5) + 5;
    juego = new Game(jugadores, modo, maxPlanetas, bolasExtra, tiempo, maxAgujeros, agujerosInofensivos);
    sonidoMenu.pause();
    sonidos.golpe.play();
    setTimeout(elToquecito, 1000);
    juego.start();
}

function elToquecito() {
    sonidos.fondo.play();
    glob_overscreen.style.backgroundColor = "";
}

function restart() {
    // Cerramos menu restart
    glob_overscreen.innerHTML = "";
    sonidos.fondo.pause();
    sonidos.finalizado.pause();
    juego.apagar();

    // Recreamos jugadores y juego
    glob_overscreen.style.backgroundColor = "black";
    sonidos.cambiarFondo();

    var jugadores = [];
    for(var idx in juego.jugadores) {
        var jugador = juego.jugadores[idx];
        jugadores.push(new Jugador(jugador.color, jugador.controlId, jugador.secondControlId));
    }
    juego = new Game(jugadores, juego.modo, juego.maxPlanetas, juego.numBolasExtra, juego.duracion,
        juego.maxAgujeros, juego.agujerosInofensivos, juego.bolasXjugador);
    sonidos.golpe.play();
    setTimeout(elToquecito, 1000);
    juego.start();

}

function mainMenu() {
    // Cerramos menu restart
    glob_overscreen.innerHTML = "";
    sonidos.finalizado.pause();
    juego.apagar();

    //glob_overscreen.style.backgroundColor = "black";

    document.getElementById("menu").style.display = "";
    document.getElementById("juego").style.display = "none";
    document.documentElement.style.animation = "";

    sonidoMenu.play();
}
var sonidoMenu = null;
var muteBtn = null;

function initMenu() {
    const addPlayer = document.getElementById('addPlayer');
    const removePlayer = document.getElementById('removePlayer');
    const blackholes = document.getElementById('blackholes');
    const harmless = document.getElementById('harmless');
    const initGame = document.getElementById('initGame');
    const time = document.getElementById('time');
    muteBtn = document.getElementById('mute');

    const modos = document.getElementById('modos');
    const interfaz = document.getElementById('interfaz');
    const creditos = document.getElementById('creditos');

    const goCredits = document.getElementById('goCredits');
    sonidoMenu = document.getElementById('sonido');

    const tablaJugadores = document.getElementById("tabla-jugadores");
    const textsTime = ['1 minute', '2 minutes', '5 minutes', 'Infinite time'];
    const valuesTime = [1, 2, 5, -1];

    var jugadoresN = 2;
    var modo;
    var tiempo = -1;

    const todosBotones = document.getElementsByTagName("a");
    Array.prototype.filter.call(todosBotones, function (value) {
        value.onmouseenter = function () {
            if (muteBtn.getAttribute('data-sound') === "1") {
                const audio = new Audio('snd/pasarBoton.ogg');
                audio.volume = 0.2;
                audio.play();
            }
        };
        value.onmouseup = function (ev) {

            if (muteBtn.getAttribute('data-sound') === "1") {
                const audio = new Audio('snd/clickBoton.ogg');
                audio.volume = 0.3;
                audio.play();
            }
        }
    });


    // Al hacer click en los botones iniciales, pasar a la siguiente pantalla
    const botonesModoJuego = document.getElementsByClassName('btn_start');
    Array.prototype.filter.call(botonesModoJuego, function (value) {
        value.onclick = function () {
            modos.style.display = 'none';
            interfaz.style.display = 'block';

            time.innerText = textsTime[textsTime.length-1];
            time.setAttribute("data-time", (textsTime.length-1).toString());
            tiempo = valuesTime[textsTime.length-1];

            switch (this.getAttribute("data-modo")) {
                case "Clasico":
                    modo = MODOS.CLASICO;
                    break;
                case "Instinto":
                    modo = MODOS.INSTINTO;
                    break;
                case "Centro":
                    time.innerText = time.innerText = textsTime[0];
                    time.setAttribute("data-time", "0");
                    tiempo = valuesTime[0];
                    modo = MODOS.CENTRO;
                    break;
            }
        }
    });

    const goBack = document.getElementsByClassName('goBack');
    Array.prototype.filter.call(goBack, function (value) {
        value.onclick = function () {
            modos.style.display = 'block';
            interfaz.style.display = 'none';
            creditos.style.display = 'none';
            goCredits.style.display = 'flex';
        }
    });

    goCredits.onclick = function () {
        modos.style.display = 'none';
        interfaz.style.display = 'none';
        goCredits.style.display = 'none';
        creditos.style.display = 'block';
    };

    // Añadir jugador
    addPlayer.onclick = function () {
        if (jugadoresN < 4) {
            ++jugadoresN;
        }
        actualizar();
    };

    removePlayer.onclick = function () {
        if (jugadoresN > 2) {
            --jugadoresN;
        }
        actualizar();
    };

    function actualizar() {
        if (jugadoresN === 4) {
            addPlayer.classList.add("disabled");
        } else {
            addPlayer.classList.remove("disabled");
        }

        if (jugadoresN === 2) {
            removePlayer.classList.add("disabled");
        } else {
            removePlayer.classList.remove("disabled");
        }
        for (let i = 1; i <= 4; ++i) {
            const mostrarJugador = i <= jugadoresN;
            var jug = document.getElementById('player_' + i);
            if(mostrarJugador && jug.style.display === "none") {
                jug.getElementsByTagName("rect")[0].style.fill = coloresDisponibles.shift();
                jug.style.display = "";
            }
            if(!mostrarJugador && jug.style.display !== "none") {
                coloresDisponibles.push(jug.getElementsByTagName("rect")[0].style.fill);
                jug.style.display = "none";
            }
        }
    }

    blackholes.onchange = function () {
        harmless.style.display = (this.checked ? 'inline-block' : 'none');
    };

    let toggle = function (ev) {
        if (ev.classList.contains("active")) {
            ev.classList.remove("active");
        } else {
            ev.classList.add("active");
        }
    };

    blackholes.onclick = function () {
        toggle(this);
        if (this.classList.contains("active")) {
            harmless.style.display = "inline-block";
        } else {
            harmless.style.display = "none";
        }
    };

    harmless.onclick = function () {
        toggle(this);
    };

    time.onclick = function () {
        let state = parseInt(time.getAttribute('data-time'));
        state = (state + 1) % (textsTime.length - (modo === MODOS.CENTRO?1:0));
        console.log("to", state);
        tiempo = valuesTime[state];
        time.setAttribute('data-time', state.toString());
        time.innerHTML = textsTime[state];
    };

    muteBtn.onclick = function () {
        toggleMute(); // sonidos.js
    };

    var coloresDisponibles = [
        "#7400a0",
        "#009999",
        "#ff0094",
        "#C15616",
        "#000099",
        "#990000",
        "#009900",
        "#bbbb00"
    ];
    const rectsJugadores = tablaJugadores.getElementsByTagName("rect");
    Array.prototype.filter.call(rectsJugadores, function(rect){
        if(rect.parentElement.parentElement.parentElement.style.display !== "none") {
            var idx = Math.floor(Math.random() * coloresDisponibles.length);
            rect.style.fill = coloresDisponibles.splice(idx, 1)[0];
        }
        rect.onclick = function () {
            coloresDisponibles.push(rect.style.fill); // Lo introducimos de último
            this.style.fill = coloresDisponibles.shift(); // Y cogemos el primero
        };
    });

    // Empezar juego (ver main.js)
    initGame.onclick = function () {
        let maxAgujeros = Math.round(Math.random() * 4) + 2;
        if (!blackholes.classList.contains("active")) {
            maxAgujeros = 0;
        }

        let agujerosInofensivos = harmless.classList.contains("active");

        // Hay jugadoresN jugadores
        // Es mejor generar la lista de jugadores aquí,
        // por si lo hacemos configurable (colores, teclas) más tarde.
        const jugadores = [];
        for (let i = 1; i <= jugadoresN; i++) {
            const jugador = document.getElementById('player_' + i);
            const rects = jugador.getElementsByTagName("rect");
            if (rects.length > 0) {
                const color = rects[0].style.fill;
                const mainKey = jugador.getElementsByClassName("key")[0].getAttribute("data-keyCode");
                const secondKey = jugador.getElementsByClassName("key")[1].getAttribute("data-keyCode");
                jugadores.push(new Jugador(color, mainKey, secondKey));
            }
        }

        iniciar(jugadores, modo, tiempo, maxAgujeros, agujerosInofensivos);
    };
}var imgAgujero = new Image();
var iconos_asteroides = {
    invencible: new Image(),
    invisible: new Image(),
    fortuna: new Image(),
    gravedad: new Image(),
    salvador: new Image(),
    transporte: new Image(),
    planetLover: new Image()
};
for(var imagen in iconos_asteroides) {
    iconos_asteroides[imagen].ready = false;
    iconos_asteroides[imagen].onload = function () {
        this.ready = true;
    };
}
var transposicionY = 0;
var prerenderizados = {};
var puntosDebug = [];
var siguienteRenderLento = 0;

/**
 * @param {CanvasRenderingContext2D} ctx
 */
function dibujarAsteroide(ctx) {
    var grd = ctx.createRadialGradient(0,0,0,0,0,4);
    ctx.save();
    ctx.translate(5, 5);
    ctx.beginPath();
    grd.addColorStop(0,"black");
    grd.addColorStop(1,"white");
    ctx.arc(0, 0, 5, 0, 2*Math.PI);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.closePath();
    ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Image} icono
 * @param {String} color
 */
function colorearIcono(ctx, icono, color) {
    ctx.fillStyle = color;
    ctx.rect(0, 0, 215, 215);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-atop";
    ctx.drawImage(icono, 0, 0, 215, 215);
}

/**
 * Pre-renderiza con una funcion de dibujo sobre un nuevo canvas y lo devuelve
 * @param {int} width ancho del canvas
 * @param {int} height alto del canvas
 * @param {function(CanvasRenderingContext2D, Object,Object)} funcionDibujo función para dibujar el elemento
 * @param param1 parametro opcional 1
 * @param param2 parametro opcional 2
 * @returns {HTMLCanvasElement}
 */
function preRenderizar(width, height, funcionDibujo, param1, param2) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var canvasCtx = canvas.getContext('2d');
    funcionDibujo(canvasCtx, param1, param2);
    return canvas;
}

function generarPreRenderizados(juego) {
    prerenderizados = {
        asteroide: preRenderizar(10, 10, dibujarAsteroide),
        paletaIconos: []
    };
    for(var i in juego.jugadores) {
        var color = juego.jugadores[i].color;
        prerenderizados.paletaIconos[i] = {
            invencible: preRenderizar(215, 215, colorearIcono, iconos_asteroides.invencible, color),
            invisible: preRenderizar(215, 215, colorearIcono, iconos_asteroides.invisible, color),
            fortuna: preRenderizar(215, 215, colorearIcono, iconos_asteroides.fortuna, color),
            gravedad: preRenderizar(215, 215, colorearIcono, iconos_asteroides.gravedad, color),
            salvador: preRenderizar(215, 215, colorearIcono, iconos_asteroides.salvador, color),
            transporte: preRenderizar(215, 215, colorearIcono, iconos_asteroides.transporte, color),
            planetLover: preRenderizar(215, 215, colorearIcono, iconos_asteroides.planetLover, color)
        };
    }
}

/**
 * Renderiza el juego
 * @param {Game} juego
 */
var render = function(juego) {
    var now = Date.now();

    if(now > siguienteRenderLento) {
        renderLento();
        siguienteRenderLento = now + RENDERIZADO_LENTO_TIME;
    }

    // Limpiamos
    ctx.clearRect(0,0,canvas.width/ glob_escala.w,canvas.height/ glob_escala.h);

    // Escalado del juego
    if(glob_escala.update) {
        glob_escala.update = false;
        ctx.scale(glob_escala.w, glob_escala.h);
    }

    // Transposición para centrar el escalado
    ctx.save();
    if(glob_escala.dominaAncho && glob_escala.h < 1) {
        ctx.translate(0, transposicionY);
    }

	//Planetas
    if(!juego.blindGame) {
        for (var i in juego.planetas)
            dibujarPlaneta(juego, juego.planetas[i]);
    }

	//Asteroides
	for(i in juego.asteroides) {
		var as = juego.asteroides[i];
		ctx.drawImage(
		    prerenderizados.asteroide,
            (0.5 + as.x - prerenderizados.asteroide.width/2) << 0,
            (0.5 + as.y - prerenderizados.asteroide.height/2) <<0,
            (0.5 + prerenderizados.asteroide.width) << 0,
            (0.5 + prerenderizados.asteroide.height) << 0);
	}
	
	//Agujeros
    if(!juego.blindGame && imgAgujero.ready) {
        for (i in juego.agujeros) {
            var ag = juego.agujeros[i];
            ctx.save();
            ctx.translate(ag.x, ag.y);
            ctx.rotate(ag.ang);
            ag.ang = (ag.ang + 0.002) % (2 * Math.PI);
            ctx.drawImage(imgAgujero, -ag.r, -ag.r, 2 * ag.r, 2 * ag.r);
            ctx.restore();
        }
    }
	
	//Bolas
	for(i in juego.bolas) {
		var bola = juego.bolas[i];
		if(!bola.viva) continue;
		if(bola.gravedad) {
			var grd = ctx.createRadialGradient(bola.x,bola.y,0,bola.x,bola.y,bola.r * 2);
			grd.addColorStop(0,"rgba(182, 247, 77, 0.4)");
			grd.addColorStop(1,"rgba(182, 247, 77, 0.1)");
			
			ctx.beginPath();
			ctx.arc(bola.x, bola.y, bola.r * 2, 0, 2*Math.PI);
			ctx.fillStyle = grd;
			ctx.fill();
			ctx.closePath();
		}

		if(bola.planetLover) {
		    var r = (now % 1200)/400 + 1; // Max = 4, min=1
		    r = Math.sqrt(r) * bola.r;
            var grd = ctx.createRadialGradient(bola.x,bola.y,0,bola.x,bola.y,r);
            grd.addColorStop(0,"rgba(140, 0, 0, 0.0)");
            grd.addColorStop(0.7,"rgba(140, 0, 0, 0.0)");
            grd.addColorStop(1,"rgba(140, 0, 0, 0.8)");

            ctx.beginPath();
            ctx.arc(bola.x, bola.y, r, 0, 2*Math.PI);
            ctx.fillStyle = grd;
            ctx.fill();
            ctx.closePath();
        }
		
		grd = ctx.createRadialGradient(bola.x,bola.y,0,bola.x,bola.y,bola.r - 1);
		ctx.beginPath();
		
        if(bola.salvado)
            grd.addColorStop(0,"#ffff00");
        else
			grd.addColorStop(0,bola.color);
		
		if(bola.invisible)
			grd.addColorStop(0.5, "rgba(0,0,0,0)");
		
		if(bola.jugador) {
            grd.addColorStop(1, bola.jugador.color);
        } else
			grd.addColorStop(1, "gray");
			
		var alpha;
		if(bola.fortuna) {
			alpha = Math.abs(2000 - (bola.fortunaTime % 4000))/2000;
			if(!bola.invencible) ctx.shadowColor = "rgba(0, 255, 0, "+alpha+")";
			else ctx.shadowColor = "green";
		}
		if(bola.invencible && (!bola.fortuna || alpha <= 0.5) )
			ctx.shadowColor = "white";
			
		if(bola.invencible || bola.fortuna)
			ctx.shadowBlur = 10;
		
        if(!bola.planeta && bola.transportado) {
            var ang = Math.atan2(bola.v.y, bola.v.x)+Math.PI;
            
            ctx.moveTo(bola.x, bola.y);
            ctx.lineTo(bola.x + 1.5 * bola.r * Math.cos(ang+Math.PI/4), bola.y + 1.5 * bola.r * Math.sin(ang+Math.PI/4));
            ctx.lineTo(bola.x + 1.5 * bola.r * Math.cos(ang+Math.PI), bola.y + 1.5 * bola.r * Math.sin(ang+Math.PI));
            ctx.lineTo(bola.x + 1.5 * bola.r * Math.cos(ang-Math.PI/4), bola.y + 1.5 * bola.r * Math.sin(ang-Math.PI/4));
            ctx.fillStyle = grd;
            ctx.fill();
        } else {
            ctx.arc(bola.x, bola.y, bola.r, 0, 2*Math.PI);
            ctx.fillStyle = grd;
            ctx.fill();
            if(bola.jugador) {
                if(now - juego.inicioPartida > 1000 && now - juego.inicioPartida < 3000) {
                    ctx.strokeStyle = bola.jugador.color;
                    var restan = (3000-(now-juego.inicioPartida))/4000;
                    ctx.save();
                    ctx.globalAlpha = restan*restan;
                    ctx.lineWidth = 5;
                    ctx.beginPath();
                    ctx.arc(bola.x, bola.y, Math.sqrt((now-juego.inicioPartida-1000)*100), 0, 2*Math.PI);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }
        ctx.closePath();
		ctx.shadowBlur = 0;
	}

    // Puntos de debug
    for(i in puntosDebug) {
        ctx.beginPath();
        if(puntosDebug[i].color) {
            ctx.fillStyle = puntosDebug[i].color;
        } else {
            grd = ctx.createRadialGradient(puntosDebug[i].x, puntosDebug[i].y, 0, puntosDebug[i].x, puntosDebug[i].y, 4);
            grd.addColorStop(0, "#00ff00");
            grd.addColorStop(1, "#ff00ff");
            ctx.fillStyle = grd;
        }
        ctx.arc(puntosDebug[i].x, puntosDebug[i].y, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.closePath();
    }

    //Reloj
    if(juego.duracion > 0) {
        // Math.round(jugadores[i].ultimaMuerte/60000) mins
        var restante =  Math.round(juego.duracion*30 - (now - juego.inicioPartida)/2000);

        if(restante >= 0 && restante < 10) {
            var rojo = juego.duracion * 60000 - (now - juego.inicioPartida); //Restante en milisegundos
            rojo = rojo % 2000; //Cíclico cada 2 segundos
            rojo = (Math.sin(rojo / 1000 * Math.PI + Math.PI / 4) + 1) / 2;
            for (i = 1; i <= restante; i++) {
                ctx.beginPath();
                ctx.rect(MAP.w / 2 - 200 + i * 4 + (i - 1) * 19, MAP.h - 40, 19, 36);
                ctx.fillStyle = "rgba(200,0,0," + rojo + ")";
                ctx.fill();
                ctx.closePath();
            }
        }
    }
	ctx.restore();
};

function renderLento() {
    // Escalado del juego
    scdCtx.clearRect(0,0,secondCanvas.width / glob_escala.w,secondCanvas.height / glob_escala.h);
    if(glob_escala.update2) {
        glob_escala.update2 = false;
        scdCtx.scale(glob_escala.w, glob_escala.h);
    }

    // Transposición para centrar el escalado
    scdCtx.save();
    if(glob_escala.dominaAncho && glob_escala.h < 1) {
        scdCtx.translate(0, transposicionY);
    }

    //Planetas
    if(!juego.blindGame) {
        for (var i in juego.planetas)
            renderPlanetaEstatico(juego.planetas[i]);
    }
    scdCtx.restore();


    // A PARTIR DE AQUÍ NO HAY TRANSPOSICIÓN (SÍ ESCALADO)
    // Modo de juego
    scdCtx.save();
    scdCtx.font="bold 20px Orbitron";
    scdCtx.shadowColor = "#471468";
    scdCtx.shadowOffsetX = 0;
    scdCtx.shadowOffsetY = 0;
    scdCtx.shadowBlur = 10;

    // Create gradient
    var gradient=scdCtx.createLinearGradient(0,0,200,0);
    gradient.addColorStop(0.25,"gray");
    gradient.addColorStop(0.75,"white");
    // Fill with gradient
    scdCtx.fillStyle=gradient;
    var w = scdCtx.measureText(juego.modo).width;
    scdCtx.fillText(juego.modo, MAP.w - w - 20, 40);
    scdCtx.restore();

    // Debug mode
    if(glob_debugMode) {
        var textos = [
            "FPS: " + glob_fps,
            "min: " + glob_fps_min
        ];
        scdCtx.save();
        scdCtx.font = "bold 30px \"Courier New\"";
        scdCtx.fillStyle = "red";
        for(i=0;i<textos.length;i++) {
            var text = textos[i];
            if (text.length < 10) {
                for (var j = 0; j < 10 - text.length; j++)
                    text += " ";
            }
            var width = scdCtx.measureText(text).width;
            scdCtx.save();
            scdCtx.fillText(text, MAP.w - width - w, 40);
            scdCtx.restore();
            scdCtx.translate(0, 30);
        }
        scdCtx.restore();
    }

    dibujarInterfazAsteroides(juego);

    //Notas
    scdCtx.save();
    var notasSize = 20;
    scdCtx.font="bold "+notasSize+"px Orbitron";
    var blur = 10;
    scdCtx.shadowColor = "#471468";
    scdCtx.shadowOffsetX = 0;
    scdCtx.shadowOffsetY = 0;
    scdCtx.shadowBlur = blur;

    for(i in Log.notas) {
        // Create gradient
        //var gradient=ctx.createLinearGradient(0,0,200,0);
        //gradient.addColorStop(0.25,notas[i].color);
        //gradient.addColorStop(0.75,"white");
        // Fill with gradient
        scdCtx.fillStyle=Log.notas[i].color;
        scdCtx.fillText(Log.notas[i].mensaje, 20, 40 + i * notasSize * 1.2);
    }
    scdCtx.restore();
}

function renderPlanetaEstatico(p) {
    if(p.renderizado) {
        p.rotar();
    }

    // Orbitas no estaticas
    if(p.centro || p.inquieto || p.radioVariable) return;

    //Los planetas tambien tienen gradiente
    var grd = scdCtx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.rg);

    if(p.nodisponible) {
        grd.addColorStop(0,"rgba(80, 80, 80, 0.4)");
        grd.addColorStop(1,"rgba(80, 80, 80, 0.1)");
    } else {
        grd.addColorStop(0,"rgba(90, 45, 180, 0.2)");
        grd.addColorStop(1,"rgba(90, 45, 180, 0.1)");
    }
    scdCtx.beginPath();
    scdCtx.arc(p.x, p.y, p.rg, 0, 2*Math.PI);
    scdCtx.fillStyle = grd;
    scdCtx.fill();
    scdCtx.closePath();

    if(p.renderizado) {
        scdCtx.drawImage(p.renderizado, p.x -((0.5 + p.r) << 0), p.y -((0.5 + p.r) << 0));
    }else{
        scdCtx.beginPath();
        scdCtx.arc(p.x, p.y, p.r, 0, 2*Math.PI);
        scdCtx.fillStyle = "#4A392C";
        scdCtx.fill();
        scdCtx.closePath();
    }
}

function dibujarPlaneta(juego, p) {
    // Descartar los de órbita estática!
    if(!p.centro && !p.inquieto && !p.radioVariable) return;

    if (p.centro) {
        var grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.rg);
        if (p.mayor_t_j !== null) {
            var segundo_mayor = 0;
            for (var idx in juego.jugadores) {
                if (juego.jugadores[idx] !== p.mayor_t_j &&
                    juego.jugadores[idx].tiempo > segundo_mayor) {
                    segundo_mayor = juego.jugadores[idx].tiempo;
                }
            }
            grd.addColorStop(0.7 * Math.min(p.mayor_t - segundo_mayor, 30) / 30 + 0.2, p.mayor_t_j.color);
        } else {
            grd.addColorStop(0, "rgba(80, 200, 80, 0.2)");
        }
        grd.addColorStop(1, "rgba(80, 200, 80, 0.1)");
    } else if (p.inquieto) {
        grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.rg);
        grd.addColorStop(0, "rgba(255, 255, 255, 0.4)");
        grd.addColorStop(1, "rgba(0, 0, 0, 0.1)")
    } else if (p.radioVariable) {
        grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.rg);
        grd.addColorStop(0, "rgba(200, 45, 180, 0.2)");
        grd.addColorStop(1, "rgba(200, 45, 180, 0.1)")
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.rg, 0, 2 * Math.PI);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.closePath();

    //Centro del Planeta
    if(p.renderizado) {
        ctx.drawImage(p.renderizado, p.x -((0.5 + p.r) << 0), p.y -((0.5 + p.r) << 0));
    }else{
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 2*Math.PI);
        ctx.fillStyle = "#4A392C";
        ctx.fill();
        ctx.closePath();
    }
}

window.onresize = function() {
    redimensionar(window.innerWidth, window.innerHeight);
};

// Redimensiona el juego adecuadamente
function redimensionar(width, height) {
    if(width < MIN_W || height < MIN_H) {
        resolucionInsuficiente(true);
        return;
    } else {
        resolucionInsuficiente(false);
    }

    // El canvas tendrá la resolución especificada
    canvas.width = width;
    secondCanvas.width = width;
    canvas.height = height;
    secondCanvas.height = height;

    // Escalamos manteniendo la proporción
    var escalaAncho = width / MAP.w;
    var escalaAlto = height / MAP.h;

    glob_escala = {
        w: escalaAncho>escalaAlto? escalaAlto: escalaAncho,
        h: escalaAlto>=escalaAncho? escalaAncho: escalaAlto,
        dominaAncho: escalaAlto>=escalaAncho,
        update: true,
        update2: true
    };
    transposicionY = (canvas.height - glob_escala.h * MAP.h) * 0.5 / glob_escala.h;
}

function debugPunto(x, y, color) {
    puntosDebug.push({x:x, y:y, color: color});
}

/**
 * @param {Game} juego
 */
function dibujarInterfazAsteroides(juego) {
    var asteroides = [];
    for(var i in juego.jugadores) {
        asteroides[i] = {};
    }
    for(i in juego.bolas) {
        var bola = juego.bolas[i];
        if(bola.jugador) {
            var jg = asteroides[juego.jugadores.indexOf(juego.bolas[i].jugador)];
            jg.invencible = jg.invencible || bola.invencible;
            jg.invisible = jg.invisible || bola.invisible;
            jg.fortuna = jg.fortuna || bola.fortuna;
            jg.gravedad = jg.gravedad || bola.gravedad;
            jg.salvador = jg.salvador || bola.salvado;
            jg.transporte = jg.transporte || bola.transportado;
            jg.planetLover = jg.planetLover || bola.planetLover;
        }
    }
    var iconos = [];
    for(i in asteroides) {
        var jugador = asteroides[i];
        if(jugador.invencible)
            iconos.push(prerenderizados.paletaIconos[i].invencible);
        if(jugador.invisible)
            iconos.push(prerenderizados.paletaIconos[i].invisible);
        if(jugador.fortuna)
            iconos.push(prerenderizados.paletaIconos[i].fortuna);
        if(jugador.gravedad)
            iconos.push(prerenderizados.paletaIconos[i].gravedad);
        if(jugador.transporte)
            iconos.push(prerenderizados.paletaIconos[i].transporte);
        if(jugador.salvador)
            iconos.push(prerenderizados.paletaIconos[i].salvador);
        if(jugador.planetLover)
            iconos.push(prerenderizados.paletaIconos[i].planetLover);

    }
    var espacio_ico = canvas.width / 24; // 6 habilidades x 4 jugadores = 24
    var lado_ico = espacio_ico * 0.8;
    var margen_ico = espacio_ico * 0.1;
    var espacioOcupado = iconos.length * espacio_ico;
    var margen_izq = (canvas.width - espacioOcupado)/2;
    ctx.save();
    ctx.shadowColor = "#471468";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 10;
    ctx.scale(1/glob_escala.w, 1/glob_escala.h);
    ctx.translate(margen_izq, canvas.height - espacio_ico);
    for(i in iconos) {
        ctx.translate(margen_ico, 0);
        ctx.drawImage(iconos[i], 0, 0, lado_ico, lado_ico);
        ctx.translate(lado_ico + margen_ico, 0);
    }
    ctx.restore();
}
function menorDistanciaPS(A, B, C)
// Menor distancia del segmento AB al punto C
{
    if(A.x === B.x && A.y === B.y) {
        // A y B son el mismo punto, devolvemos A->C
        return moduloVector(A.x - C.x, A.y - C.y);
    } else {
        var uN = (C.x-A.x)*(B.x-A.x)+(C.y-A.y)*(B.y-A.y); //Numerador
        var uD = Math.pow((B.x - A.x),2)+Math.pow((B.y - A.y), 2); //Denominador
        var u = uN / uD;
        //Si u < 0, d = A->C; u > 1, d = B->C; else d = P->C (Calcular P)

        if (u < 0)
            return moduloVector(A.x - C.x, A.y - C.y);
        else if (u > 1)
            return moduloVector(B.x - C.x, B.y - C.y);
        else {
            var P = [A.x + u * (B.x - A.x), A.y + u * (B.y - A.y)];
            return moduloVector(P[0] - C.x, P[1] - C.y);
        }
    }
}
function signo(n) {
	if(n < 0) return -1;
	else return 1;
}

function moduloVector(x, y) {
	return Math.sqrt( x*x + y*y );
}var sonidos = {};
sonidos.pong = new Audio('snd/pong.ogg');
sonidos.pong.volume = 1;
sonidos.pong2 = new Audio('snd/pong2.ogg');
sonidos.pong2.volume = 0.9;
sonidos.entrada = new Audio('snd/entrada.ogg');
sonidos.entrada.volume = 0.9;
sonidos.claxon = new Audio('snd/claxon.ogg');
sonidos.claxon.volume = 0.7;
sonidos.cambio = new Audio('snd/cambioOrbita.ogg');
sonidos.cambio.volume = 0.6;
sonidos.muerte = new Audio('snd/muerte.ogg');
sonidos.muerte.volume = 0.9;
sonidos.cinta = new Audio('snd/cinta.ogg');
sonidos.cinta.volume = 0.8;
sonidos.golpe = new Audio('snd/golpe.ogg');
sonidos.golpe.volume = 0.8;
sonidos.dados = new Audio('snd/dados.ogg');
sonidos.dados.volume = 0.8;

sonidos.finalizado = new Audio('snd/beat_culture_julien.mp3');
sonidos.finalizado.volume = 0.3;

/**
 * @type {[Audio]}
 */
var fondos = [
    new Audio('snd/Jay_Krewel_Break_The_Rules.ogg'),
    new Audio('snd/Space And Time.mp3'),
    new Audio('snd/Zythian_Bring_It_Back.mp3')
];
sonidos.cambiarFondo = function() {
    sonidos.fondo = fondos[Math.floor(Math.random() * fondos.length)];
    sonidos.fondo.currentTime = 0;
    sonidos.fondo.volume = 0.3;
    sonidos.fondo.loop = true;
};
sonidos.cambiarFondo();

/**
 * Reproduce el sonido indicado
 * @param {Audio} sonido
 */
function reproducir(sonido) {
    sonido.currentTime = 0;
    sonido.play();
}

var glob_muted = false;
function toggleMute() {
    glob_muted = !glob_muted;
    for(var key in sonidos) {
        sonidos[key].muted = glob_muted;
    }
    for(key in fondos) {
        fondos[key].muted = glob_muted;
    }
    sonidoMenu.muted = glob_muted;

    // Menú
    if(muteBtn) {
        muteBtn.innerHTML = (glob_muted?"🔈":"🔊");
    }
}
})();