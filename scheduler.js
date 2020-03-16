require('dotenv').config({ path: './app.env' });
process.env.TZ = "Asia/Shanghai";
const db = require('./db');
const moment = require("moment");
const getFutureTiming = require('cronicle-client').getFutureTiming;
const CronicleClient = require('cronicle-client').CronicleClient;
const scheduler = new CronicleClient({
    masterUrl: process.env.CRONICLE_URL,
    apiKey: process.env.CRONICLE_API_KEY
});
/** ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- **/
// 向Cronicle添加定时转储2天前的task
scheduler.getEvent({
    title: 'dump_task'
}).catch(function() {  // 没有这个job，则创建
    scheduler.createEvent({
        title: 'dump_task',
        catch_up: 1,
        enabled: 1,
        category: 'general',
        target: 'allgrp',
        algo: 'round_robin',
        plugin: 'urlplug',
        params: {
            method: 'get',
            url: 'http://' + process.env.SCHEDULED_SERVICE_ID + ":" + process.env.SCHEDULED_SERVICE_PORT + '/dump_task',
            success_match: '1',
            error_match: '0'
        },
        retries: 3,
        retry_delay: 30,
        timing: {
            "hours": [ 3 ],
            "minutes": [ 0 ]
        },
        timezone: 'Asia/Shanghai'
    }).then(function() {
        console.log('向Cronicle添加了转储task的任务');
    }).catch(function(err) {
        console.log(err.code + ":" + err.message);
        process.exit();
    });
});
// 向Cronicle添加要调度的洒水计划
db.exec("select * from plan", [], function (plans) {
    plans.forEach(function (plan, index, arr) {
        var cover_dates = plan.cover_date.split(",");
        cover_dates.forEach(function (cover_date, i, arr) {
            scheduler.getEvent({
                title: plan.id + "-" + i
            }).catch(function() {  // 没有这个job，则创建
                scheduler.createEvent({
                    title: plan.id + "-" + i,
                    catch_up: 1,
                    enabled: 1,
                    category: 'general',
                    target: 'allgrp',
                    algo: 'round_robin',
                    plugin: 'urlplug',
                    params: {
                        method: 'post',
                        url: 'http://' + process.env.SCHEDULED_SERVICE_ID + ":" + process.env.SCHEDULED_SERVICE_PORT + '/irrigate/' + plan.id + '/' + plan.involved_nozzle + '/' + plan.how_long,
                        success_match: '1',
                        error_match: '0'
                    },
                    retries: 3,
                    retry_delay: 30,
                    timing: getFutureTiming(cover_date + " " + plan.start_time),
                    timezone: 'Asia/Shanghai'
                }).then(function() {
                    console.log("启动时向Cronicle添加了%d球场%d区域洒水计划%s，调度时间%s", plan.course_id, plan.area_id, plan.id + "-" + i, cover_date + " " + plan.start_time);
                }).catch(function(err) {
                    console.log(err.code + ":" + err.message);
                    process.exit();
                });
            });
        });
    });
});
// 每分钟调度一次，查看分控箱是否正常
setInterval(function() {
    db.exec("select id,last_recv_time from controlbox", [], function (controlboxes) {
        for(var i=0; i<controlboxes.length; i++) {
            if (controlboxes[i].last_recv_time !== null) {
                var diff = moment().diff(moment(controlboxes[i].last_recv_time), 'minute');
                if (diff >= 5) {
                    db.exec("update controlbox set use_state=0 where id=?", [controlboxes[i].id]);
                } else {
                    db.exec("update controlbox set use_state=1 where id=?", [controlboxes[i].id]);
                }
            }
        }
    });
}, 60000);