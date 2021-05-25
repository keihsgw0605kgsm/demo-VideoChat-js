"use strict";   // 厳格モードとする

// ↓↓↓グローバル変数↓↓↓

const g_elementDivJoinScreen = document.getElementById( "div_join_screen" );
const g_elementDivChatScreen = document.getElementById( "div_chat_screen" );
const g_elementInputUserName = document.getElementById( "input_username" );

const g_elementCheckboxCamera = document.getElementById( "checkbox_camera" );
const g_elementCheckboxMicrophone = document.getElementById( "checkbox_microphone" );

const g_elementDivUserInfo = document.getElementById( "div_userinfo" );

const g_elementTextUserName = document.getElementById( "text_username" );
//const g_elementTextRemoteUserName = document.getElementById( "text_remote_username" );

const g_elementVideoLocal = document.getElementById( "video_local" );
//const g_elementVideoRemote = document.getElementById( "video_remote" );
//const g_elementAudioRemote = document.getElementById( "audio_remote" );

const g_elementBtnLeave = document.getElementById("btn_leave");

//const g_elementTextMessageForSend = document.getElementById( "text_message_for_send" );
//const g_elementTextareaMessageReceived = document.getElementById( "textarea_message_received" );

// let g_rtcPeerConnection = null;
let g_mapRtcPeerConnection = new Map();

// クライアントからサーバーへの接続要求
const g_socket = io.connect();

const recordingTimeMS = 5000;

//console.log("const OK");

// ↑↑↑グローバル変数↑↑↑

// ↓↓↓UIから呼ばれる関数↓↓↓

// ページがunloadされる（閉じる、再読み込み、別ページへ移動）直前に呼ばれる関数
window.addEventListener("beforeunload",　( event ) =>　{
    event.preventDefault(); // 既定の動作のキャンセル

    onclickButton_LeaveChat();        // チャットからの離脱
    g_socket.disconnect();    // Socket.ioによるサーバーとの接続の切断

    e.returnValue = ""; // Chrome では returnValue を設定する必要がある
    return ""; // Chrome 以外では、return を設定する必要がある
} );

// 「Join」ボタンを押すと呼ばれる関数
function onsubmitButton_Join(){
    console.log( "UI Event : 'Join' button clicked." );

    // ユーザー名
    let strInputUserName = g_elementInputUserName.value;
    console.log( "- User name :", strInputUserName );

    //ユーザ名が入力されていなかった場合
    if( !strInputUserName ){
        return;
    }
    g_elementTextUserName.value = strInputUserName; //ビデオチャット画面のユーザ名欄に表示

    // サーバーに"join"を送信
    console.log( "- Send 'Join' to server" );
    g_socket.emit( "join", {} );

    // 画面の切り替え
    g_elementDivJoinScreen.style.display = "none";  // 参加画面(最初のjoin画面)の非表示
    g_elementDivChatScreen.style.display = "block";  // チャット画面の表示
}

// カメラとマイクのOn/Offのチェックボックスを押すと呼ばれる関数
function onclickCheckbox_CameraMicrophone(){
    console.log( "UI Event : Camera/Microphone checkbox clicked." );

    // これまでの状態
    let trackCamera_old = null;
    let trackMicrophone_old = null;
    let bCamera_old = false;
    let bMicrophone_old = false;
    let idCameraTrack_old = "";
    let idMicrophoneTrack_old = "";
    let stream = g_elementVideoLocal.srcObject;
    if( stream ) {
        trackCamera_old = stream.getVideoTracks()[0];
        if( trackCamera_old ) {
            bCamera_old = true;
            idCameraTrack_old = trackCamera_old.id;
        }
        trackMicrophone_old = stream.getAudioTracks()[0];
        if( trackMicrophone_old ) {
            bMicrophone_old = true;
            idMicrophoneTrack_old = trackMicrophone_old.id;
        }
    }

    // 今後の状態
    let bCamera_new = false;
    //カメラオンにチェックした場合
    if( g_elementCheckboxCamera.checked ) {
        bCamera_new = true;
    }
    let bMicrophone_new = false;
    //音声オンにチェックしていた場合
    if( g_elementCheckboxMicrophone.checked ) {
        bMicrophone_new = true;
    }

    // 状態変化
    console.log( "Camera :  %s => %s", bCamera_old, bCamera_new );
    console.log( "Microphoneo : %s = %s", bMicrophone_old, bMicrophone_new );

    //チェックボックスに変化が無い場合
    if( bCamera_old === bCamera_new && bMicrophone_old === bMicrophone_new ) {
        return;
    }

    g_mapRtcPeerConnection.forEach( ( rtcPeerConnection ) => {
        // コネクションオブジェクトに対してTrack削除を行う。
        // （コネクションオブジェクトに対してTrack削除を行わなかった場合、使用していないstream通信が残る。）
        let senders = rtcPeerConnection.getSenders();
        senders.forEach( ( sender ) => {
            if( sender.track ) {
                if( idCameraTrack_old === sender.track.id || idMicrophoneTrack_old === sender.track.id) {
                    rtcPeerConnection.removeTrack( sender );
                    // removeTrack()の結果として、通信相手に、streamの「removetrack」イベントが発生する。
                }
            }
        });
    });

    // 古いメディアストリームのトラックの停止（トラックの停止をせず、HTML要素のstreamの解除だけではカメラは停止しない（カメラ動作LEDは点いたまま））
    if( trackCamera_old ) {
        console.log( "Call : trackCamera_old.stop()" );
        trackCamera_old.stop();
    }
    if( trackMicrophone_old ) {
        console.log( "Call : trackMicrophone_old.stop()" );
        trackMicrophone_old.stop();
    }
    // HTML要素のメディアストリームの解除
    console.log( "Call : setStreamToElement( Video_Local, null )" );
    setStreamToElement( g_elementVideoLocal, null );

    // チェックボックスの状態の変化があり、かつ、カメラとマイクを両方Offの場合
    if( !bCamera_new && !bMicrophone_new )
    {
        return;
    }

    // チェックボックスの状態の変化があり、かつ、カメラとマイクのどちらかもしくはどちらもOnの場合

    // 自分のメディアストリームを取得する。
    // - 古くは、navigator.getUserMedia() を使用していたが、廃止された。
    //   現在は、navigator.mediaDevices.getUserMedia() が新たに用意され、これを使用する。
    console.log( "Call : navigator.mediaDevices.getUserMedia( video=%s, audio=%s )", bCamera_new, bMicrophone_new );
    //カメラも音声も両方もしくは片方ON
    //navigator.mediaDevices.getUserMedia()でカメラを<video>と同期
    navigator.mediaDevices.getUserMedia( { video: bCamera_new, audio: bMicrophone_new } ).then( ( stream ) => {
        //g_elementBtnLeave.href = stream;
        g_mapRtcPeerConnection.forEach( ( rtcPeerConnection ) => {
            // コネクションオブジェクトに対してTrack追加を行う。
            stream.getTracks().forEach( ( track ) => {
                rtcPeerConnection.addTrack( track, stream );
                // addTrack()の結果として、「Negotiation needed」イベントが発生する。
            });
        })
        .then(() => startRecording(g_elementVideoLocal.captureStream(), recordingTimeMS))
        /*.then(recordedChunks => {
            let recordedBlob = new Blob(recordedChunks, {type: "video/webm"});
            g_elementBtnLeave.download = "RecordedVideo.webm";
        })*/

        // HTML要素へのメディアストリームの設定
        console.log( "Call : setStreamToElement( Video_Local, stream )" );
        setStreamToElement( g_elementVideoLocal, stream );
    })
    .catch( ( error ) => {
        // メディアストリームの取得に失敗⇒古いメディアストリームのまま。チェックボックスの状態を戻す。
        console.error( "Error : ", error );
        alert( "Could not start Camera." );
        g_elementCheckboxCamera.checked = false;
        g_elementCheckboxMicrophone.checked = false;
        return;
    } );
}

// 「Send Message」ボタンを押すと呼ばれる関数
/*
function onsubmitButton_SendMessage() {
    console.log( "UI Event : 'Send Message' button clicked." );

    if( !g_mapRtcPeerConnection.size ) {   // コネクションオブジェクトがない
        alert( "Connection object does not exist." );
        return;
    }
    //if( !isDataChannelOpen( g_rtcPeerConnection ) )
    //{   // DataChannelオブジェクトが開いていない
    //    alert( "Datachannel is not open." );
    //    return;
    //}

    if( !g_elementTextMessageForSend.value ) {
        alert( "Message for send is empty. Please enter the message for send." );
        return;
    }

    // メッセージをDataChannelを通して相手に直接送信
    g_mapRtcPeerConnection.forEach( ( rtcPeerConnection ) => {
        console.log( "- Send Message through DataChannel" );
        rtcPeerConnection.datachannel.send( JSON.stringify( { type: "message", data: g_elementTextMessageForSend.value } ) );
    });

    // 送信メッセージをメッセージテキストエリアへ追加
    g_elementTextareaMessageReceived.value = g_elementTextMessageForSend.value + "\n" + g_elementTextareaMessageReceived.value; // 一番上に追加
    //g_elementTextareaMessageReceived.value += g_elementTextMessageForSend.value + "\n"; // 一番下に追加
    g_elementTextMessageForSend.value = "";
}
*/

// 「Leave Chat.」ボタンを押すと呼ばれる関数
function onclickButton_LeaveChat() {
    console.log( "UI Event : 'Leave Chat.' button clicked." );

    g_mapRtcPeerConnection.forEach( ( rtcPeerConnection ) =>
    {
        if( isDataChannelOpen( rtcPeerConnection ) ) {
            // チャット中
            // チャット離脱の通知をDataChannelを通して相手に直接送信
            console.log( "- Send 'leave' through DataChannel" );
            rtcPeerConnection.datachannel.send( JSON.stringify( { type: "leave", data: "" } ) );
        }

        console.log( "Call : endPeerConnection()" );
        endPeerConnection( rtcPeerConnection );
    });
    
    // ユーザー名のクリア
    g_elementTextUserName.value = "";

    // 画面の切り替え
    g_elementDivChatScreen.style.display = "none";  // チャット画面の非表示
    g_elementDivJoinScreen.style.display = "flex";  // 参加画面の表示
}

// ↑↑↑UIから呼ばれる関数↑↑↑

// ↓↓↓Socket.IO関連の関数↓↓↓

// 接続時の処理
// ・サーバーとクライアントの接続が確立すると、
// 　サーバー側で、"connection"イベント
// 　クライアント側で、"connect"イベントが発生する
g_socket.on("connect", () => {
    console.log( "Socket Event : connect" );
});

// サーバーからのメッセージ受信に対する処理
// ・サーバー側のメッセージ拡散時の「io.broadcast.emit( "signaling", objData );」に対する処理
g_socket.on( "signaling", ( objData ) => {
    console.log( "Socket Event : signaling" );
    console.log( "- type : ", objData.type );
    console.log( "- data : ", objData.data );

    // 送信元のSocketID
    let strRemoteSocketID = objData.from;
    console.log( "- from : ", objData.from );

    if( !g_elementTextUserName.value ) {
        // 自身がまだ参加していないときは、"signaling"イベントを無視。
        console.log( "Ignore 'signaling' event because I haven't join yet." );
        return;
    }

    if( "join" === objData.type ) {
        // onclickButton_CreateOfferSDP()、onclickButton_SendOfferSDP()と同様の処理

        if( g_mapRtcPeerConnection.get( strRemoteSocketID ) ) {
            // 既にコネクションオブジェクトあり
            alert( "Connection object already exists." );
            return;
        }

        // RTCPeerConnectionオブジェクトの作成
        console.log( "Call : createPeerConnection()" );
        let rtcPeerConnection = createPeerConnection( g_elementVideoLocal.srcObject, strRemoteSocketID );
        g_mapRtcPeerConnection.set( strRemoteSocketID, rtcPeerConnection );    // グローバル変数に設定

        // DataChannelの作成
        let datachannel = rtcPeerConnection.createDataChannel( "datachannel" );
        // DataChannelオブジェクトをRTCPeerConnectionオブジェクトのメンバーに追加。
        rtcPeerConnection.datachannel = datachannel;
        // DataChannelオブジェクトのイベントハンドラの構築
        console.log( "Call : setupDataChannelEventHandler()" );
        setupDataChannelEventHandler( rtcPeerConnection );

        // OfferSDPの作成
        console.log( "Call : createOfferSDP()" );
        createOfferSDP( rtcPeerConnection );
    }
    else if( "offer" === objData.type ) {
        // onclickButton_SetOfferSDPandCreateAnswerSDP()と同様の処理
        // 設定するOffserSDPとして、テキストエリアのデータではなく、受信したデータを使用する。

        if( g_mapRtcPeerConnection.get( strRemoteSocketID ) ) {
            // 既にコネクションオブジェクトあり
            alert( "Connection object already exists." );
            return;
        }

        // RTCPeerConnectionオブジェクトの作成
        console.log( "Call : createPeerConnection()" );
        let rtcPeerConnection = createPeerConnection( g_elementVideoLocal.srcObject, strRemoteSocketID );
        g_mapRtcPeerConnection.set( strRemoteSocketID, rtcPeerConnection );    // グローバル変数に設定

        // OfferSDPの設定とAnswerSDPの作成
        console.log( "Call : setOfferSDP_and_createAnswerSDP()" );
        setOfferSDP_and_createAnswerSDP( rtcPeerConnection, objData.data );   // 受信したSDPオブジェクトを渡す。

        // リモートユーザー名の設定
        //g_elementTextRemoteUserName.value = objData.username;
        // リモート情報表示用のHTML要素の追加
        appendRemoteInfoElement( strRemoteSocketID, objData.username );
    }
    else if( "answer" === objData.type ) {
        // onclickButton_SetAnswerSDPthenChatStarts()と同様の処理
        // 設定するAnswerSDPとして、テキストエリアのデータではなく、受信したデータを使用する。

        let rtcPeerConnection = g_mapRtcPeerConnection.get( strRemoteSocketID );
        
        if( !rtcPeerConnection ) {
            // コネクションオブジェクトがない
            alert( "Connection object does not exist." );
            return;
        }

        // AnswerSDPの設定
        console.log( "Call : setAnswerSDP()" );
        setAnswerSDP( rtcPeerConnection, objData.data );   // 受信したSDPオブジェクトを渡す。

        // リモートユーザー名の設定
        //g_elementTextRemoteUserName.value = objData.username;
        // リモート情報表示用のHTML要素の追加
        appendRemoteInfoElement( strRemoteSocketID, objData.username );
    }
    else if( "candidate" === objData.type ) {
        let rtcPeerConnection = g_mapRtcPeerConnection.get( strRemoteSocketID );

        if( !rtcPeerConnection ) {
            // コネクションオブジェクトがない
            alert( "Connection object does not exist." );
            return;
        }

        // Vanilla ICEの場合は、ここには来ない。
        // Trickle ICEの場合は、相手側のICE candidateイベントで送信されたICE candidateを、コネクションに追加する。

        // ICE candidateの追加
        console.log( "Call : addCandidate()" );
        addCandidate( rtcPeerConnection, objData.data );   // 受信したICE candidateの追加
    }
    else {
        console.error( "Unexpected : Socket Event : signaling" );
    }
});

// ↑↑↑Socket.IO関連の関数↑↑↑

// ↓↓↓DataChannel関連の関数↓↓↓

// DataChannelオブジェクトのイベントハンドラの構築
function setupDataChannelEventHandler( rtcPeerConnection ) {
    if( !( "datachannel" in rtcPeerConnection ) ) {
        console.error( "Unexpected : DataChannel does not exist." );
        return;
    }

    // message イベントが発生したときのイベントハンドラ
    rtcPeerConnection.datachannel.onmessage = ( event ) => {
        console.log( "DataChannel Event : message" );
        let objData = JSON.parse( event.data );
        console.log( "- type : ", objData.type );
        console.log( "- data : ", objData.data );

        if( "message" === objData.type ) {
            // 受信メッセージをメッセージテキストエリアへ追加
            let strMessage = objData.data;
            g_elementTextareaMessageReceived.value = strMessage + "\n" + g_elementTextareaMessageReceived.value; // 一番上に追加
            //g_elementTextareaMessageReceived.value += strMessage + "\n";  // 一番下に追加
        }
        else if( "offer" === objData.type ) {
            // 受信したOfferSDPの設定とAnswerSDPの作成
            console.log( "Call : setOfferSDP_and_createAnswerSDP()" );
            setOfferSDP_and_createAnswerSDP( rtcPeerConnection, objData.data );
        }
        else if( "answer" === objData.type ) {
            // 受信したAnswerSDPの設定
            console.log( "Call : setAnswerSDP()" );
            setAnswerSDP( rtcPeerConnection, objData.data );
        }
        else if( "candidate" === objData.type ) {
            // 受信したICE candidateの追加
            console.log( "Call : addCandidate()" );
            addCandidate( rtcPeerConnection, objData.data );
        }
        else if( "leave" === objData.type ) {
            console.log( "Call : endPeerConnection()" );
            endPeerConnection( rtcPeerConnection );
        }
    }
}

// DataChannelが開いているか
function isDataChannelOpen( rtcPeerConnection ) {
    if( !( "datachannel" in rtcPeerConnection ) ) {
        // datachannelメンバーが存在しない
        return false;
    }
    if( !rtcPeerConnection.datachannel ) {
        // datachannelメンバーがnull
        return false;
    }
    if( "open" !== rtcPeerConnection.datachannel.readyState ){
        // datachannelメンバーはあるが、"open"でない。
        return false;
    }
    // DataCchannelが開いている
    return true;
}

// ↑↑↑DataChannel関連の関数↑↑↑

// ↓↓↓RTCPeerConnection関連の関数↓↓↓

// RTCPeerConnectionオブジェクトの作成
function createPeerConnection( stream, strRemoteSocketID ) {
    // RTCPeerConnectionオブジェクトの生成
    let config = {
        "iceServers": [
            { "urls": "stun:stun.l.google.com:19302" },
            { "urls": "stun:stun1.l.google.com:19302" },
            { "urls": "stun:stun2.l.google.com:19302" },
        ]
    };
    let rtcPeerConnection = new RTCPeerConnection( config );

    // チャット相手のSocketIDをRTCPeerConnectionオブジェクトのメンバーに追加。
    rtcPeerConnection.strRemoteSocketID = strRemoteSocketID;

    // RTCPeerConnectionオブジェクトのイベントハンドラの構築
    setupRTCPeerConnectionEventHandler( rtcPeerConnection );

    // RTCPeerConnectionオブジェクトのストリームにローカルのメディアストリームを追加
    if( stream ) {
        // - 古くは、RTCPeerConnection.addStream(stream) を使用していたが、廃止予定となった。
        //   現在は、RTCPeerConnection.addTrack(track, stream) を使用する。
        stream.getTracks().forEach( ( track ) => {
            rtcPeerConnection.addTrack( track, stream );
        });
    }
    else {
        console.log( "No local stream." );
    }

    return rtcPeerConnection;
}

// コネクションの終了処理
function endPeerConnection( rtcPeerConnection ) {
    // リモート映像の停止
    //console.log( "Call : setStreamToElement( Video_Remote, null )" );
    //setStreamToElement( g_elementVideoRemote, null );
    // リモート音声の停止
    //console.log( "Call : setStreamToElement( Audio_Remote, null )" );
    //setStreamToElement( g_elementAudioRemote, null );
    // リモート映像表示用のHTML要素の削除
    console.log( "Call : removeRemoteVideoElement()" );
    removeRemoteInfoElement( rtcPeerConnection.strRemoteSocketID );

    // DataChannelの終了
    if( "datachannel" in rtcPeerConnection ) {
        rtcPeerConnection.datachannel.close();
        rtcPeerConnection.datachannel = null;
    }

    // グローバル変数のクリア
    //g_rtcPeerConnection = null;
    // グローバル変数Mapから削除
    g_mapRtcPeerConnection.delete( rtcPeerConnection.strRemoteSocketID );

    // ピアコネクションの終了
    rtcPeerConnection.close();
}

// RTCPeerConnectionオブジェクトのイベントハンドラの構築
function setupRTCPeerConnectionEventHandler( rtcPeerConnection ) {
    // Negotiation needed イベントが発生したときのイベントハンドラ
    // - このイベントは、セッションネゴシエーションを必要とする変更が発生したときに発生する。
    //   一部のセッション変更はアンサーとしてネゴシエートできないため、このネゴシエーションはオファー側として実行されなければならない。
    //   最も一般的には、negotiationneededイベントは、RTCPeerConnectionに送信トラックが追加された後に発生する。
    //   ネゴシエーションがすでに進行しているときに、ネゴシエーションを必要とする方法でセッションが変更された場合、
    //   ネゴシエーションが完了するまで、negotiationneededイベントは発生せず、ネゴシエーションがまだ必要な場合にのみ発生する。
    //   see : https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onnegotiationneeded
    rtcPeerConnection.onnegotiationneeded = () => {
        console.log( "Event : Negotiation needed" );

        if( !isDataChannelOpen( rtcPeerConnection ) ) {
            // チャット前
            // OfferSDPの作成は、ユーザーイベントから直接呼び出すので、
            // Negotiation Neededイベントは無視する。
        }
        else {
            // チャット中
            // OfferSDPを作成し、DataChannelを通して相手に直接送信
            console.log( "Call : createOfferSDP()" );
            createOfferSDP( rtcPeerConnection );
        }
    };

    // ICE candidate イベントが発生したときのイベントハンドラ
    // - これは、ローカルのICEエージェントがシグナリング・サーバを介して
    //   他のピアにメッセージを配信する必要があるときはいつでも発生する。
    //   これにより、ブラウザ自身がシグナリングに使用されている技術についての詳細を知る必要がなく、
    //   ICE エージェントがリモートピアとのネゴシエーションを実行できるようになる。
    //   see : https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onicecandidate
    rtcPeerConnection.onicecandidate = ( event ) => {
        console.log( "Event : ICE candidate" );
        if( event.candidate ) {
            // ICE candidateがある
            console.log( "- ICE candidate : ", event.candidate );

            // Vanilla ICEの場合は、何もしない
            // Trickle ICEの場合は、ICE candidateを相手に送る

            if( !isDataChannelOpen( rtcPeerConnection ) ) {
                // チャット前
                // ICE candidateをサーバーを経由して相手に送信
                console.log( "- Send ICE candidate to server" );
                g_socket.emit( "signaling", { to: rtcPeerConnection.strRemoteSocketID, type: "candidate", data: event.candidate } );
            }
            else {
                // チャット中
                // ICE candidateをDataChannelを通して相手に直接送信
                console.log( "- Send ICE candidate through DataChannel" );
                rtcPeerConnection.datachannel.send( JSON.stringify( { type: "candidate", data: event.candidate } ) );
            }
        }
        else {
            // ICE candiateがない = ICE candidate の収集終了。
            console.log( "- ICE candidate : empty" );
        }
    };

    // ICE candidate error イベントが発生したときのイベントハンドラ
    // - このイベントは、ICE候補の収集処理中にエラーが発生した場合に発生する。
    //   see : https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onicecandidateerror
    rtcPeerConnection.onicecandidateerror = ( event ) => {
        console.error( "Event : ICE candidate error. error code : ", event.errorCode );
    };

    // ICE gathering state change イベントが発生したときのイベントハンドラ
    // - このイベントは、ICE gathering stateが変化したときに発生する。
    //   言い換えれば、ICEエージェントがアクティブに候補者を収集しているかどうかが変化したときに発生する。
    //   see : https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onicegatheringstatechange
    rtcPeerConnection.onicegatheringstatechange = () => {
        console.log( "Event : ICE gathering state change" );
        console.log( "- ICE gathering state : ", rtcPeerConnection.iceGatheringState );

        if( "complete" === rtcPeerConnection.iceGatheringState ) {
            // Vanilla ICEの場合は、ICE candidateを含んだOfferSDP/AnswerSDPを相手に送る
            // Trickle ICEの場合は、何もしない
            
            if( "offer" === rtcPeerConnection.localDescription.type ) {
                // OfferSDPをサーバーに送信
                //console.log( "- Send OfferSDP to server" );
                //g_socket.emit( "signaling", { type: "offer", data: rtcPeerConnection.localDescription } );
            }
            else if( "answer" === rtcPeerConnection.localDescription.type ) {
                // AnswerSDPをサーバーに送信
                //console.log( "- Send AnswerSDP to server" );
                //g_socket.emit( "signaling", { type: "answer", data: rtcPeerConnection.localDescription } );
            }
            else {
                console.error( "Unexpected : Unknown localDescription.type. type = ", rtcPeerConnection.localDescription.type );
            }
        }
    };

    // ICE connection state change イベントが発生したときのイベントハンドラ
    // - このイベントは、ネゴシエーションプロセス中にICE connection stateが変化するたびに発生する。 
    // - 接続が成功すると、通常、状態は「new」から始まり、「checking」を経て、「connected」、最後に「completed」と遷移します。 
    //   ただし、特定の状況下では、「connected」がスキップされ、「checking」から「completed」に直接移行する場合があります。
    //   これは、最後にチェックされた候補のみが成功した場合に発生する可能性があり、成功したネゴシエーションが完了する前に、
    //   収集信号と候補終了信号の両方が発生します。
    //   see : https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceconnectionstatechange_event
    rtcPeerConnection.oniceconnectionstatechange = () => {
        console.log( "Event : ICE connection state change" );
        console.log( "- ICE connection state : ", rtcPeerConnection.iceConnectionState );
        // "disconnected" : コンポーネントがまだ接続されていることを確認するために、RTCPeerConnectionオブジェクトの少なくとも
        //                  1つのコンポーネントに対して失敗したことを確認します。これは、"failed "よりも厳しいテストではなく、
        //                  断続的に発生し、信頼性の低いネットワークや一時的な切断中に自然に解決することがあります。問題が
        //                  解決すると、接続は "接続済み "の状態に戻ることがあります。
        // "failed"       : ICE candidateは、すべての候補のペアを互いにチェックしたが、接続のすべてのコンポーネントに
        //                  互換性のあるものを見つけることができなかった。しかし、ICEエージェントがいくつかの
        //                  コンポーネントに対して互換性のある接続を見つけた可能性がある。
        // see : https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState
    };

    // Signaling state change イベントが発生したときのイベントハンドラ
    // - このイベントは、ピア接続のsignalStateが変化したときに送信される。
    //   これは、setLocalDescription（）またはsetRemoteDescription（）の呼び出しが原因で発生する可能性がある。
    //   see : https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onsignalingstatechange
    rtcPeerConnection.onsignalingstatechange = () => {
        console.log( "Event : Signaling state change" );
        console.log( "- Signaling state : ", rtcPeerConnection.signalingState );
    };

    // Connection state change イベントが発生したときのイベントハンドラ
    // - このイベントは、ピア接続の状態が変化したときに送信される。
    //   see : https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onconnectionstatechange
    rtcPeerConnection.onconnectionstatechange = () => {
        console.log( "Event : Connection state change" );
        console.log( "- Connection state : ", rtcPeerConnection.connectionState );
        // "disconnected" : 接続のためのICEトランスポートの少なくとも1つが「disconnected」状態であり、
        //                  他のトランスポートのどれも「failed」、「connecting」、「checking」の状態ではない。
        // "failed"       : 接続の1つ以上のICEトランスポートが「失敗」状態になっている。
        // see : https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState

        if( "failed" === rtcPeerConnection.connectionState ) {
            // 「ビデオチャット相手との通信が切断」が「しばらく」続き、通信が復帰しないとき、Connection state「failed」となる。
            // - 「ビデオチャット相手との通信が切断」になると「すぐに」Connection state「failed」となるわけではない。
            // - 相手のチャット離脱後、速やかにコネクション終了処理を行うためには、離脱側からチャット離脱メッセージを送信し、受信側でコネクション終了処理を行うようにする。
            console.log( "Call : endPeerConnection()" );
            endPeerConnection( rtcPeerConnection );
        }
    };

    // Track イベントが発生したときのイベントハンドラ
    // - このイベントは、新しい着信MediaStreamTrackが作成され、
    //   コネクション上のレシーバーセットに追加されたRTCRtpReceiverオブジェクトに関連付けられたときに送信される。
    //   see : https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/ontrack
    // - 古くは、rtcPeerConnection.onaddstream に設定していたが、廃止された。
    //   現在は、rtcPeerConnection.ontrack に設定する。
    rtcPeerConnection.ontrack = ( event ) => {
        console.log( "Event : Track" );
        console.log( "- stream", event.streams[0] );
        console.log( "- track", event.track );

        // HTML要素へのリモートメディアストリームの設定
        let stream = event.streams[0];
        let track = event.track;
        if( "video" === track.kind ) {
            let elementVideoRemote = getRemoteVideoElement( rtcPeerConnection.strRemoteSocketID );
            console.log( "Call : setStreamToElement( Video_Remote, stream )" );
            setStreamToElement( elementVideoRemote, stream );
        }
        else if( "audio" === track.kind ) {
            let elementAudioRemote = getRemoteAudioElement( rtcPeerConnection.strRemoteSocketID );
            console.log( "Call : setStreamToElement( Audio_Remote, stream )" );
            setStreamToElement( elementAudioRemote, stream );
        }
        else {
            console.error( "Unexpected : Unknown track kind : ", track.kind );
        }

        // 相手のメディアストリームがRTCPeerConnectionから削除されたときのイベントハンドラ
        // - 相手の RTCPeerConnection.removeTrack( sender );
        //   の結果として、streamの「removetrack」イベントが発生する。
        // - 古くは、rtcPeerConnection.onremovetrack に設定していたが、廃止された。
        //   現在は、stream.onremovetrack に設定する。
        stream.onremovetrack = ( evt ) => {
            console.log( "Stream Event : remove track" );
            console.log( "- stream", stream );
            console.log( "- track", evt.track );

            // HTML要素のメディアストリームの解除
            let trackRemove = evt.track;
            if( "video" === trackRemove.kind ) {
                let elementVideoRemote = getRemoteVideoElement( rtcPeerConnection.strRemoteSocketID );
                console.log( "Call : setStreamToElement( Video_Remote, null )" );
                setStreamToElement( elementVideoRemote, null );
            }
            else if( "audio" === trackRemove.kind ) {
                let elementAudioRemote = getRemoteAudioElement( rtcPeerConnection.strRemoteSocketID );
                console.log( "Call : setStreamToElement( Audio_Remote, null )" );
                setStreamToElement( elementAudioRemote, null );
            }
            else {
                console.error( "Unexpected : Unknown track kind : ", trackRemove.kind );
            }
        };
    };

    // Data channel イベントが発生したときのイベントハンドラ
    // - このイベントは、createDataChannel() を呼び出すリモートピアによって
    //   RTCDataChannelが接続に追加されたときに送信されます。
    //   see : https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/ondatachannel
    rtcPeerConnection.ondatachannel = ( event ) => {
        console.log( "Event : Data channel" );

        // DataChannelオブジェクトをRTCPeerConnectionオブジェクトのメンバーに追加。
        rtcPeerConnection.datachannel = event.channel;
        // DataChannelオブジェクトのイベントハンドラの構築
        console.log( "Call : setupDataChannelEventHandler()" );
        setupDataChannelEventHandler( rtcPeerConnection );
        
        // オファーをされた側として、OfferSDPを作成し、DataChannelを通して相手に直接送信
        // （オファーした側でカメラや（orマイク）をOnにしなかった場合、
        //   オファーされた側でカメラ（orマイク）をOnにしても、
        //   カメラ映像（orマイク音声）の通信ストリームは作成されず、カメラ映像（マイク音声）は相手に送信されない。
        //   オファーされた側として、OfferSDPを作成、送信することで、
        //   オファーした側、オファーされた側、双方で必要な通信ストリームが整う。）
        console.log( "Call : createOfferSDP()" );
        createOfferSDP( rtcPeerConnection );
    };
}

// OfferSDPの作成
function createOfferSDP( rtcPeerConnection ) {
    // OfferSDPの作成
    console.log( "Call : rtcPeerConnection.createOffer()" );
    rtcPeerConnection.createOffer().then( ( sessionDescription ) => {
        // 作成されたOfferSDPををLocalDescriptionに設定
        console.log( "Call : rtcPeerConnection.setLocalDescription()" );
        return rtcPeerConnection.setLocalDescription( sessionDescription );
    }).then( () => {
        // Vanilla ICEの場合は、まだSDPを相手に送らない
        // Trickle ICEの場合は、初期SDPを相手に送る

        if( !isDataChannelOpen( rtcPeerConnection ) ) {
            // チャット前
            // 初期OfferSDPをサーバーを経由して相手に送信
            console.log( "- Send OfferSDP to server" );
            g_socket.emit( "signaling", { to: rtcPeerConnection.strRemoteSocketID, type: "offer",
                                            data: rtcPeerConnection.localDescription, username: g_elementTextUserName.value } );
        }
        else {
            // チャット中
            // 初期OfferSDPをDataChannelを通して相手に直接送信
            console.log( "- Send OfferSDP through DataChannel" );
            rtcPeerConnection.datachannel.send( JSON.stringify( { type: "offer", data: rtcPeerConnection.localDescription } ) );
        }
    }).catch( ( error ) => {
        console.error( "Error : ", error );
    });
}

// OfferSDPの設定とAnswerSDPの作成
function setOfferSDP_and_createAnswerSDP( rtcPeerConnection, sessionDescription ) {
    console.log( "Call : rtcPeerConnection.setRemoteDescription()" );
    rtcPeerConnection.setRemoteDescription( sessionDescription ).then( () => {
        // AnswerSDPの作成
        console.log( "Call : rtcPeerConnection.createAnswer()" );
        return rtcPeerConnection.createAnswer();
    }).then( ( sessionDescription ) =>{
        // 作成されたAnswerSDPををLocalDescriptionに設定
        console.log( "Call : rtcPeerConnection.setLocalDescription()" );
        return rtcPeerConnection.setLocalDescription( sessionDescription );
    }).then( () => {
        // Vanilla ICEの場合は、まだSDPを相手に送らない
        // Trickle ICEの場合は、初期SDPを相手に送る

        if( !isDataChannelOpen( rtcPeerConnection ) ) {
            // チャット前
            // 初期AnswerSDPをサーバーを経由して相手に送信
            console.log( "- Send AnswerSDP to server" );
            g_socket.emit( "signaling", { to: rtcPeerConnection.strRemoteSocketID, type: "answer",
                                            data: rtcPeerConnection.localDescription, username: g_elementTextUserName.value } );
        }
        else{
            // チャット中
            // 初期AnswerSDPをDataChannelを通して相手に直接送信
            console.log( "- Send AnswerSDP through DataChannel" );
            rtcPeerConnection.datachannel.send( JSON.stringify( { type: "answer", data: rtcPeerConnection.localDescription } ) );
        }
    }).catch( ( error ) => {
        console.error( "Error : ", error );
    });
}

// AnswerSDPの設定
function setAnswerSDP( rtcPeerConnection, sessionDescription ) {
    console.log( "Call : rtcPeerConnection.setRemoteDescription()" );
    rtcPeerConnection.setRemoteDescription( sessionDescription ).catch( ( error ) => {
        console.error( "Error : ", error );
    });
}

// ICE candidateの追加
function addCandidate( rtcPeerConnection, candidate ) {
    console.log( "Call : rtcPeerConnection.addIceCandidate()" );
    rtcPeerConnection.addIceCandidate( candidate ).catch( ( error ) =>
    {
        console.error( "Error : ", error );
    });
}

// ↑↑↑RTCPeerConnection関連の関数↑↑↑

// ↓↓↓その他の内部関数↓↓↓

// HTML要素へのメディアストリームの設定（もしくは解除。および開始）
// HTML要素は、「ローカルもしくはリモート」の「videoもしくはaudio」。
// メディアストリームは、ローカルメディアストリームもしくはリモートメディアストリーム、もしくはnull。
// メディアストリームには、Videoトラック、Audioトラックの両方もしくは片方のみが含まれる。
// メディアストリームに含まれるトラックの種別、設定するHTML要素種別は、呼び出し側で対処する。
function setStreamToElement( elementMedia, stream ) {
    // メディアストリームを、メディア用のHTML要素のsrcObjに設定する。
    // - 古くは、elementVideo.src = URL.createObjectURL( stream ); のように書いていたが、URL.createObjectURL()は、廃止された。
    //   現在は、elementVideo.srcObject = stream; のように書く。
    elementMedia.srcObject = stream;

    if( !stream ) {
        // メディアストリームの設定解除の場合は、ここで処理終了
        return;
    }

    // 音量
    if( "VIDEO" === elementMedia.tagName ) {
        // VIDEO：ボリュームゼロ、ミュート
        elementMedia.volume = 0.0;
        elementMedia.muted = true;
    }
    else if( "AUDIO" === elementMedia.tagName ) {
        // AUDIO：ボリュームあり、ミュートでない
        elementMedia.volume = 1.0;
        elementMedia.muted = false;
    }
    else {
        console.error( "Unexpected : Unknown ElementTagName : ", elementMedia.tagName );
    }
}

// リモート情報表示用のHTML要素の追加
function appendRemoteInfoElement( strRemoteSocketID, strUserName ) {
    // <div border="1 solid #000000"><input type="text" id="text_remote_username" readonly="readonly"><br /><video id="video_remote" width="320" height="240" style="border: 1px solid black;"></video><audio id="audio_remote"></audio></div>

    // IDの作成
    let strElementTextID = "text_" + strRemoteSocketID;
    let strElementVideoID = "video_" + strRemoteSocketID;
    let strElementAudioID = "audio_" + strRemoteSocketID;
    let strElementTableID = "table_" + strRemoteSocketID;

    // text HTML要素の作成
    let elementText = document.createElement( "input" );
    elementText.id = strElementTextID;
    elementText.type = "text";
    elementText.readOnly = "readonly";
    elementText.style.margin = "10px 0px 0px 10px"
    elementText.style.width = "160px";
    elementText.style.height = "15px";
    elementText.style.fontSize = "10px";
    elementText.value = strUserName;

    // video HTML要素の作成
    let elementVideo = document.createElement( "video" );
    elementVideo.id = strElementVideoID;
    elementVideo.width = "640";
    elementVideo.height = "360";
    elementVideo.style.border = "1px solid black";
    elementVideo.style.backgroundColor = "#000000";
    elementVideo.style.margin = "0px 10px 10px 10px"
    elementVideo.autoplay = true;

    // audio HTML要素の作成
    let elementAudio = document.createElement( "audio" );
    elementAudio.id = strElementAudioID;
    elementAudio.autoplay = true;

    // div HTML要素の作成
    let elementDiv = document.createElement( "div" );
    elementDiv.id = strElementTableID;
    elementDiv.border = "1px solid black";

    // 要素の配置
    elementDiv.appendChild( elementText );    // ユーザー名
    elementDiv.appendChild( document.createElement( "br" ) ); // 改行
    elementDiv.appendChild( elementVideo );   // Video
    elementDiv.appendChild( elementAudio );   // Audio
    g_elementDivUserInfo.appendChild( elementDiv );
}

// リモート映像表示用のHTML要素の取得
function getRemoteVideoElement( strRemoteSocketID ) {
    let strElementVideoID = "video_" + strRemoteSocketID;

    return document.getElementById( strElementVideoID );
}

// リモート音声用のHTML要素の取得
function getRemoteAudioElement( strRemoteSocketID ) {
    let strElementAudioID = "audio_" + strRemoteSocketID;

    return document.getElementById( strElementAudioID );
}

// リモート情報表示用のHTML要素の削除
function removeRemoteInfoElement( strRemoteSocketID ) {
    let strElementTableID = "table_" + strRemoteSocketID;

    let elementTable = document.getElementById( strElementTableID );

    if( !elementTable ) {
        console.error( "Unexpected : Remote Video Element is not exist. RemoteSocketID = ", strRemoteSocketID );
    }

    // 要素の削除
    g_elementDivUserInfo.removeChild( elementTable );
}


function wait(delayInMS) {
    return new Promise(resolve => setTimeout(resolve, delayInMS));
}

//録画開始
function startRecording(stream, lengthInMS) {
    let recorder = new MediaRecorder(stream);
    let data = [];

    recorder.ondataavailable = event => data.push(event.data);
    recorder.start();
    console.log(recorder.state + " for " + (lengthInMS/1000) + " seconds...");

    let stopped = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = event => reject(event.name);
    });

    let recorded = wait(lengthInMS).then(
        () => recorder.state == "recording" && recorder.stop()
    );

    return Promise.all([
        stopped,
        recorded
    ]).then(() => data);
}

//録画終了(『Leave Chat』押した際のダウンロード前に呼び出される必要がある)
function stopRecording(stream) {
    stream.getTracks().forEach(track => track.stop());
}

// ↑↑↑その他の内部関数↑↑↑

