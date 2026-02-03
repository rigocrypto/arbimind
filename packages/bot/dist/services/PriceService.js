"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceService = void 0;
class PriceService {
    _provider;
    constructor(_provider) {
        this._provider = _provider;
    }
    async getQuote(_tokenIn, _tokenOut, _amountIn, _dex) {
        // Stub – return null until wired to DEX quote API
        void this._provider;
        return null;
    }
}
exports.PriceService = PriceService;
//# sourceMappingURL=PriceService.js.map