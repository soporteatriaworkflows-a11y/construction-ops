-- Phase 3A DB Validation — run via docker exec psql

-- T13: Trigger formula correctness
SELECT 'T13_trigger_obs1' AS test, CASE WHEN suggested_net_price = 25760.0 THEN 'PASS' ELSE 'FAIL:'||suggested_net_price::text END AS result FROM resource_price_observations WHERE id='00000000-0000-0000-0000-000000001001';
SELECT 'T13_trigger_obs2' AS test, CASE WHEN suggested_net_price = 28025.0 THEN 'PASS' ELSE 'FAIL:'||suggested_net_price::text END AS result FROM resource_price_observations WHERE id='00000000-0000-0000-0000-000000001002';
SELECT 'T13_trigger_obs3' AS test, CASE WHEN suggested_net_price = 35000.0 THEN 'PASS' ELSE 'FAIL:'||suggested_net_price::text END AS result FROM resource_price_observations WHERE id='00000000-0000-0000-0000-000000001003';

-- T17: Constraint — reject negative observed_price
DO $$ BEGIN
  BEGIN
    INSERT INTO resource_price_observations(id,organization_id,resource_id,observed_price,discount_percent,suggested_net_price,unit,currency,source_type,status,created_by,observed_at)
    VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1',-1,0,0,'m3','COP','manual','pending','00000000-0000-0000-0000-000000000011',NOW());
    RAISE EXCEPTION 'FAIL: negative price accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T17_nonneg_price: PASS';
  END;
END $$;

-- T18: Constraint — reject discount > 100
DO $$ BEGIN
  BEGIN
    INSERT INTO resource_price_observations(id,organization_id,resource_id,observed_price,discount_percent,suggested_net_price,unit,currency,source_type,status,created_by,observed_at)
    VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1',100,101,0,'m3','COP','manual','pending','00000000-0000-0000-0000-000000000011',NOW());
    RAISE EXCEPTION 'FAIL: discount>100 accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T18_discount_range: PASS';
  END;
END $$;

-- T19: Constraint — reject invalid currency
DO $$ BEGIN
  BEGIN
    INSERT INTO resource_price_observations(id,organization_id,resource_id,observed_price,discount_percent,suggested_net_price,unit,currency,source_type,status,created_by,observed_at)
    VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1',100,0,0,'m3','XXXX','manual','pending','00000000-0000-0000-0000-000000000011',NOW());
    RAISE EXCEPTION 'FAIL: invalid currency accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T19_currency_iso: PASS';
  END;
END $$;

-- T20: Constraint — reject invalid source_type
DO $$ BEGIN
  BEGIN
    INSERT INTO resource_price_observations(id,organization_id,resource_id,observed_price,discount_percent,suggested_net_price,unit,currency,source_type,status,created_by,observed_at)
    VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1',100,0,0,'m3','COP','invalid_src','pending','00000000-0000-0000-0000-000000000011',NOW());
    RAISE EXCEPTION 'FAIL: invalid source_type accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T20_source_type: PASS';
  END;
END $$;

-- T21: Constraint — reject invalid status
DO $$ BEGIN
  BEGIN
    INSERT INTO resource_price_observations(id,organization_id,resource_id,observed_price,discount_percent,suggested_net_price,unit,currency,source_type,status,created_by,observed_at)
    VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1',100,0,0,'m3','COP','manual','invalid_status','00000000-0000-0000-0000-000000000011',NOW());
    RAISE EXCEPTION 'FAIL: invalid status accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T21_status: PASS';
  END;
END $$;

-- T22: Constraint — reject rejected without rejection_reason
DO $$ BEGIN
  BEGIN
    INSERT INTO resource_price_observations(id,organization_id,resource_id,observed_price,discount_percent,suggested_net_price,unit,currency,source_type,status,created_by,observed_at)
    VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1',100,0,0,'m3','COP','manual','rejected','00000000-0000-0000-0000-000000000011',NOW());
    RAISE EXCEPTION 'FAIL: rejected without reason accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T22_rejection_requires_reason: PASS';
  END;
END $$;

-- T23: Constraint — reject approved without approved_by
DO $$ BEGIN
  BEGIN
    INSERT INTO resource_price_observations(id,organization_id,resource_id,observed_price,discount_percent,suggested_net_price,unit,currency,source_type,status,created_by,observed_at)
    VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1',100,0,0,'m3','COP','manual','approved','00000000-0000-0000-0000-000000000011',NOW());
    RAISE EXCEPTION 'FAIL: approved without approver accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T23_approved_requires_approver: PASS';
  END;
END $$;

-- T24: No DELETE policy — should fail without superuser bypass
-- (This is verified structurally: no DELETE policy in pg_policies)
SELECT 'T24_no_delete_policy' AS test,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL: DELETE policy found' END AS result
FROM pg_policies WHERE tablename='resource_price_observations' AND cmd='DELETE';

-- T25: Column list — verify all expected columns exist
SELECT 'T25_column_count' AS test, COUNT(*)::text AS result
FROM information_schema.columns
WHERE table_name='resource_price_observations' AND table_schema='public'
  AND column_name IN ('id','organization_id','resource_id','supplier_id','observed_price','discount_percent','suggested_net_price','unit','currency','source_type','source_url','source_reference','observed_at','valid_until','status','approved_by','approved_at','rejection_reason','notes','created_by','created_at','updated_at');
