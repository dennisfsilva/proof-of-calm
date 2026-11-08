import json, time, csv, sys, urllib.request, datetime as dt, os
UA = {"User-Agent": "proof-of-calm-research/0.1 (+https://proofofcalm.com)"}
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def get(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            print("retry", attempt, url, e, file=sys.stderr); time.sleep(1.5*(attempt+1))
    raise SystemExit("failed: "+url)

def bitstamp(pair, start_ts, path):
    rows = {}
    start = start_ts
    now = int(time.time())
    while start < now:
        d = get(f"https://www.bitstamp.net/api/v2/ohlc/{pair}/?step=86400&limit=1000&start={start}")
        ohlc = d["data"]["ohlc"]
        if not ohlc: break
        for o in ohlc:
            rows[int(o["timestamp"])] = (o["open"], o["high"], o["low"], o["close"], o["volume"])
        last = int(ohlc[-1]["timestamp"])
        if last <= start: break
        start = last + 86400
        time.sleep(0.4)
    with open(path, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["date","open","high","low","close","volume"])
        for ts in sorted(rows):
            w.writerow([dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%d"), *rows[ts]])
    print(pair, "bitstamp rows", len(rows), "first", dt.datetime.fromtimestamp(min(rows), dt.timezone.utc).date(), "last", dt.datetime.fromtimestamp(max(rows), dt.timezone.utc).date())

def coinbase(product, start_date, path):
    rows = {}
    start = dt.datetime.fromisoformat(start_date).replace(tzinfo=dt.timezone.utc)
    end_all = dt.datetime.now(dt.timezone.utc)
    while start < end_all:
        end = min(start + dt.timedelta(days=290), end_all)
        url = f"https://api.exchange.coinbase.com/products/{product}/candles?granularity=86400&start={start.strftime('%Y-%m-%dT%H:%M:%SZ')}&end={end.strftime('%Y-%m-%dT%H:%M:%SZ')}"
        d = get(url)
        for c in d:
            t, lo, hi, op, cl, vol = c
            rows[int(t)] = (op, hi, lo, cl, vol)
        start = end
        time.sleep(0.35)
    with open(path, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["date","open","high","low","close","volume"])
        for ts in sorted(rows):
            w.writerow([dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%d"), *rows[ts]])
    if rows:
        print(product, "coinbase rows", len(rows), "first", dt.datetime.fromtimestamp(min(rows), dt.timezone.utc).date(), "last", dt.datetime.fromtimestamp(max(rows), dt.timezone.utc).date())
    else:
        print(product, "coinbase: no rows")

bitstamp("btcusd", 1313366400, f"{OUT}/bitstamp_btcusd_daily.csv")   # 2011-08-15
bitstamp("ethusd", 1501545600, f"{OUT}/bitstamp_ethusd_daily.csv")   # 2017-08-01
coinbase("BTC-USD", "2015-07-20", f"{OUT}/coinbase_btcusd_daily.csv")
coinbase("ETH-USD", "2016-05-18", f"{OUT}/coinbase_ethusd_daily.csv")
coinbase("LINK-USD", "2019-06-26", f"{OUT}/coinbase_linkusd_daily.csv")
coinbase("SOL-USD", "2021-05-24", f"{OUT}/coinbase_solusd_daily.csv")
