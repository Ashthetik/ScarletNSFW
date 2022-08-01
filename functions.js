const { Canvas } = import("canvas");
const fs = import("node:fs");
const request = import("request");
const tf = import("@tensorflow/tfjs-node");

/**
 * @param {string} url
 * @returns {Promise<any>} Prediction values
 */
export async function is_nsfw(url) {
    if (!url) {
        throw new SyntaxError(`[ERRO] Loading->URL : URL_NOT_PROVIDED`);
    }
    let image = await this.download_image(url, () => { });
    let results = Predict.__main__(image, `${__dirname}/${image}`);
    fs.unlink(image, e => {
        if (e) {
            throw new Error("[ERRO] Loading->Image : PATH_TO_IMAGE_NOT_FOUND");
        }
    })
    return results;
}

/**
 * 
 * @param {string} url
 * @param {()=>void} callback
 */
export async function download_image(url, callback) {
    var image;
    if ((/(\.gif|\.png|\.jpg)/gi).test(url)) {
        image = url.slice(0, url.indexOf("/"));
        image = image.slice(url.length, -4)
    }
    let fn = `${image}.jpg`;
    request.head(url, (e, res) => {
        if (e) {
            throw new Error(e);
        }
        console.log(`\
        [INFO] Download->URL : ${url}\n \
        [INFO] Download->Content_Type : ${res.headers["content-type"]}\n \
        [INFO] Download->Content_Length : ${res.headers["content-length"]} \
        `);
        if (res.headers["Content-Length"] > (5 * 1000000)) {
            console.log(`\
            [ERROR] Download->URL : ${url}\n \
            [ERROR] Download->Content_Type : ${res.headers["content-type"]}\n \
            [ERROR] Download->Content_Length : ${res.headers["content-length"]} \
            [ERROR] Download->Message : File_Size_Too_Big \
            `);
            return false;
        }
        request(url).pipe(fs.createWriteStream(fn).on("close", callback ?? function (e) {
            if (e) {
                throw new Error(e)
            }
        }));
    });

    return fn;
};

// File: Predictor.js
class Predict {
    constructor() { };
    static options = {
        debug: true,
        modelPath = "./model.json",
        minScore = 0.30,
        maxResults = 50,
        outputNodes: ['output1', 'output2', 'output3'],
        blurNode: true,
        blurRadius: 25,
    };
    static labels = [ // class labels
        'exposed anus',
        'exposed armpits',
        'belly',
        'exposed belly',
        'buttocks',
        'exposed buttocks',
        'female face',
        'male face',
        'feet',
        'exposed feet',
        'breast',
        'exposed breast',
        'vagina',
        'exposed vagina',
        'male breast',
        'exposed male breast',
    ];
    static composite = {
        person: [6, 7],
        sexy: [1, 2, 3, 4, 8, 9, 10, 15],
        nude: [0, 5, 11, 12, 13]
    };

    static async rect(canvas, {
        // Image Positioning (Origin)
        x = 0, y = 0,
        // Image Dimensions (Origin)
        width = 0, height = 0,
        // Blur Parameters
        radius = 8, lineWidth = 2,
        // Text Settings
        color = "#FF0", title = '', font = "16px 'Arial'"
    }) {
        if (!canvas) {
            return;
        }
        const ctx = canvas.canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.fillStyle = color;
        ctx.font = font;
        ctx.fillText(title, x + 4, y - 4);
    };

    static async blur(canvas, {
        // Blur Radius Settings
        left = 0, top = 0, width = 0, height = 0
    }) {
        if (!canvas) {
            return;
        }
        const blurCanvas = new Canvas(width / options.blurRadius, height / options.blurRadius);
        const blurCtx = blurCanvas.getContext('2d');
        if (!blurCtx) {
            return;
        }
        blurCtx.imageSmoothingEnabled = true;
        blurCtx.drawImage(canvas, left, top, width, height, 0, 0, blurCanvas.width, blurCanvas.height);
        const canvasCtx = canvas.canvas.getContext('2d');
        canvasCtx.drawImage(blurCanvas, left, top, width, height);
    };

    static async get_model(modelPath) {
        let o;
        await this.download_image(modelPath, async function (e, res) {
            if (e) {
                throw new Error("[ERRO] Model->%d : %s", modelPath, e);
            }
            if (!fs.exists(res)) {
                throw new Error("[ERRO] Model->%d : %s", modelPath, "FILE_NOT_FOUND");
            }

            const data = fs.readFile(res);
            const buffer_t = tf.node.decodeImage(data);
            const expand_t = tf.expandDims(buffer_t, 0);
            const image_t = tf.cast(expand_t, 'float32');
            image_t['file'] = res;

            tf.dispose([expand_t, buffer_t]);
            return o += image_t;
        })
        return o;
    };

    static async saveProcImage(i, o, data) {
        if (!data) {
            return false;
        }

        return new Promise(async function (resolve) {
            const original = await this.get_model(i);
            const c = new Canvas(original.width, original.height);
            const ctx = c.getContext('2d');
            ctx.drawImage(original, 0, 0, c.width, c.height);
            for (const obj of data.parts) {
                if (this.composite.nude.includes(obj.id) && options.blurNude) {
                    this.blur(c, {
                        left: obj.box[0], top: obj.box[1], width: obj.box[2], height: obj.box[3]
                    });
                }
                this.rect(c, {
                    x: obj.box[0], y: obj.box[1], width: obj.box[2], height: obj.box[3], title: `${Math.round(100 * obj.score)}% ${obj.class}`,
                });
            }
            const out = fs.createWriteStream(o);
            out.on("finish", () => {
                if (this.options.debug) {
                    console.log(`[DEBUG] Image->${o}->Saved`);
                }
                resolve(true);
            }).on("error", (e) => {
                console.log(`[ERROR] Image->${o}->${e}`);
                resolve(true);
            });

            c.createJPEGStream({
                quality: 1,
                chromaSubsampling: true,
                progressive: true,
            }).pipe(out);
        });
    };

    static async procPred(boxes, scores, classes, input) {
        const b = await boxes.array();
        const s = await scores.data();
        const c = await classes.data();
        const nmsT = await tf.image.nonMaxSuppressionAsync(b[0], s, options.maxResults, options.iouThreshold, options.minScore);
        const nms = await nmsT.data();
        tf.dispose(nmsT);
        const parts = [];
        for (const i in nms) {
            const id = parseInt(i);
            parts.push({
                score: s[i],
                id: c[id],
                class: labels[c[id]],
                box: [
                    Math.trunc(b[0][id][0]),
                    Math.trunc(b[0][id][1]),
                    Math.trunc((b[0][id][3] - b[0][id][1])),
                    Math.trunc((b[0][id][2] - b[0][id][0])),
                ],
            });
        }

        const results = {
            input: {
                file: input.file,
                width: input.shape[2],
                height: input.shape[1],
            },
            person: parts.filter((a) => composite.person.includes(a.id)).length > 0,
            sexy: parts.filter((a) => composite.sexy.includes(a.id)).length > 0,
            nude: parts.filter((a) => composite.nude.includes(a.id)).length > 0,
            parts: parts,
        };
        if (options.debug) {
            console.log(`\
                [DEBUG] Results->${JSON.stringify(results, null, 2)}\n \
            `);
        }
        return results;
    };

    static async runDetect(input, output) {
        const t = {};
        if (!this.models[this.options.modelPath]) {
            try {
                this.models[this.options.modelPath] = await tf.loadGraphModel(this.options.modelPath);
                this.models[this.options.modelPath].path = this.options.modelPath;
                if (this.options.debug) {
                    console.log(`[DEBUG] Model->${this.options.modelPath}->Loaded`);
                }
            } catch (e) {
                console.log(`[ERROR] Model->${this.options.modelPath}->${e}`);
                return null;
            }
        }
        t.input = await this.get_model(input);
        [t.boxes, t.scores, t.classes] = await this.models[this.options.modelPath].executeAsync(t.input, options.outputNodes);
        const res = await this.procPred(t.boxes, t.scores, t.classes, t.input);
        Object.keys(t).forEach((k) => {
            tf.dispose(t[k]);
        });
        await this.saveProcImage(this.options.modelPath, output, res);
        console.log(`[INFO] Image->${input}->${output}`);
        return res;
    };

    static async __main__(input, output) {
        await tf.enableProdMode();
        await tf.ready();
        await this.runDetect(input, output);
    }
};
