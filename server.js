"use strict";   // 厳格モードとする

// モジュール
const express = require( "express" );
const http = require( "http" );
const socketIO = require( "socket.io" );

// オブジェクト
const app = express();
const server = http.Server( app );
const io = socketIO( server );

// 定数
const PORT = process.env.PORT || 1337;

// 接続時の処理
// ・サーバーとクライアントの接続が確立すると、
// 　サーバー側で、"connection"イベント
// 　クライアント側で、"connect"イベントが発生する
io.on("connection", ( socket ) => {
    console.log( "connection : ", socket.id );

    // 切断時の処理
    // ・クライアントが切断したら、サーバー側では"disconnect"イベントが発生する
    socket.on("disconnect", () => {
        console.log( "disconnect : ", socket.id );
    } );

    // signalingデータ受信時の処理
    // ・クライアント側のsignalingデータ送信「socket.emit( "signaling", objData );」に対する処理
    socket.on("signaling", ( objData ) => {
        console.log( "signaling : ", socket.id );
        console.log( "- type : ", objData.type );

        // 指定の相手に送信
        if( "to" in objData ) {
            console.log( "- to : ", objData.to );
            // 送信元SocketIDを送信データに付与し、指定の相手に送信
            objData.from = socket.id;
            socket.to( objData.to ).emit( "signaling", objData );
        }
        else {
            console.error( "Unexpected : Unknown destination" );
        }
    } );

    // ビデオチャット参加時の処理
    socket.on("join", ( objData ) => {
        console.log( "join : ", socket.id );

        // 「join」を送信元以外の全員に送信
        // 送信元SocketIDを送信データに付与し、送信元以外の全員に送信
        socket.broadcast.emit( "signaling", { from: socket.id, type: "join" } );
    } );
} );

// 公開フォルダの指定
app.use( express.static( __dirname + "/public" ) );

// サーバーの起動
server.listen(PORT, () => {
    console.log( "Server on port %d", PORT );
} );
