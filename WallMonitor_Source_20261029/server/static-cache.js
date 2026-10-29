import path from 'node:path';

                                                                          
                                                                              
export function staticCacheHeaders(response,filePath) {
  response.setHeader('Cache-Control',path.extname(filePath)==='.html'?'no-store':'private, no-cache');
}
