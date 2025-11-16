"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trainingDataSchema = exports.sentimentSchema = exports.predictionSchema = void 0;
const joi_1 = __importDefault(require("joi"));
exports.predictionSchema = joi_1.default.object({
    tokenA: joi_1.default.string().required(),
    tokenB: joi_1.default.string().required(),
    dex1: joi_1.default.string().required(),
    dex2: joi_1.default.string().required(),
    amountIn: joi_1.default.string().required(),
    priceData: joi_1.default.object().optional(),
    orderBookData: joi_1.default.object().optional(),
    marketData: joi_1.default.object().optional()
});
exports.sentimentSchema = joi_1.default.object({
    tokens: joi_1.default.array().items(joi_1.default.string()).required(),
    sources: joi_1.default.array().items(joi_1.default.string()).optional()
});
exports.trainingDataSchema = joi_1.default.object({
    trainingData: joi_1.default.array().required(),
    modelType: joi_1.default.string().valid('prediction', 'sentiment', 'risk', 'all').required()
});
//# sourceMappingURL=aiSchemas.js.map