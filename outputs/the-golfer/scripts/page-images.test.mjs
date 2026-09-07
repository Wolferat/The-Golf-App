import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPageImageUrls,pageReferencesImage} from '../lib/page-images.js';
test('Finalsite encoded responsive images are discovered and verifiable on the official page',()=>{
 const sizes=encodeURIComponent(JSON.stringify([{url:'https://cdn.example.com/small/golf.jpg',width:256},{url:'https://cdn.example.com/large/golf.jpg',width:1200}]));
 const html=`<img data-image-sizes="${sizes}">`;
 assert.deepEqual(extractPageImageUrls(html,'https://example.com').map(x=>x.href),['https://cdn.example.com/large/golf.jpg']);
 assert.equal(pageReferencesImage(html,'https://cdn.example.com/large/golf.jpg','https://example.com'),true);
 assert.equal(pageReferencesImage(html,'https://unrelated.example/other.jpg','https://example.com'),false);
});
test('malformed responsive metadata does not prevent ordinary image discovery',()=>{
 assert.equal(extractPageImageUrls('<img src="/golf.jpg"><img data-image-sizes="%bad">','https://example.com')[0].href,'https://example.com/golf.jpg');
});
