var express = require('express');
var router = express.Router();
var { is_nsfw } = import("../functions");
var Hold = new Map();

/* GET /scarlet home page */
router.post('/scarlet/nsfw', function (req, res) {
    res.send({
        error: {},
        message: "Rewrite under development",
        status: 200
    });

    let image = req?.body?.image;

    if (Hold.get(req.ip)) {
        return res.status(429).send({ "error": "Too_Many_Requests" });
    } else {
        Hold.set(req.ip, 1);
        setTimeout(async () => {
            if (!image) {
                return res.status(400).send({ "error": "No_Image_Provided" });
            }
            await is_nsfw(image).then((result) => {
                if (!result) {
                    return res.status(500).send({ "error": "Internal_Server_Error" });
                }
                return res.status(200).send(result);
            });
        }, 5000);
        Hold.delete(req.ip);
    }
});

module.exports = router;