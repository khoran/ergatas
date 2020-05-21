package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QJobCatagories extends QJobCatagories("jobCatagories") {
  override def as(variable: String) = new QJobCatagories(variable)

}

class QJobCatagories(md: PathMetadata[_]) extends RelationalPathImpl[JobCatagories](md, "web", "job_catagories") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

  val catagory = createString("catagory")

  val jobCatagoryKey = createNumber[Int]("jobCatagoryKey")

  val socGroup = createString("socGroup")

  val jobCatagoriesPkey: PrimaryKey[JobCatagories] = createPrimaryKey(jobCatagoryKey)

  val _profileJobsJobCatagoryKeyFkey: ForeignKey[ProfileJobs] = createInvForeignKey(jobCatagoryKey, "job_catagory_key")

  addMetadata(catagory, ColumnMetadata.named("catagory").ofType(12).withSize(2147483647).notNull())
  addMetadata(jobCatagoryKey, ColumnMetadata.named("job_catagory_key").ofType(4).withSize(10).notNull())
  addMetadata(socGroup, ColumnMetadata.named("soc_group").ofType(12).withSize(2147483647).notNull())
}

